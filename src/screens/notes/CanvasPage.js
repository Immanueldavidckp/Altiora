import React, { useState, useRef, useMemo, useCallback } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Switch, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { COLORS, SPACING, BORDER_RADIUS } from '../../theme/colors';
import { updateSessionContent } from '../../db/database';

const ERASE_RADIUS = 16;
const PEN_COLORS = ['#FFFFFF', '#6C5CE7', '#00D2FF', '#00E676', '#FF9100', '#FF5252'];
const PEN_THICKNESSES = [2, 4, 7];
const IMAGE_DEFAULT_MAX_DIM = 260;

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// A smooth line through a run of [x, y, pressure] points (quadratic bezier through midpoints).
function svgPathFromPoints(points) {
    if (points.length === 0) return '';
    if (points.length === 1) {
        const [x, y] = points[0];
        return `M ${x} ${y} L ${x} ${y}`;
    }
    let d = `M ${points[0][0]} ${points[0][1]}`;
    for (let i = 1; i < points.length - 1; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[i + 1];
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        d += ` Q ${x0} ${y0} ${mx} ${my}`;
    }
    const last = points[points.length - 1];
    d += ` L ${last[0]} ${last[1]}`;
    return d;
}

function avgPressure(points) {
    if (points.length === 0) return 0.5;
    const sum = points.reduce((acc, p) => acc + (p[2] ?? 0.5), 0);
    return sum / points.length;
}

function strokeWidthFor(baseWidth, points) {
    const p = avgPressure(points);
    return Math.max(1, baseWidth * (0.5 + p));
}

function parseCanvasContent(raw) {
    try {
        const parsed = JSON.parse(raw || '{}');
        return {
            canvasSize: parsed.canvasSize ?? null,
            strokes: Array.isArray(parsed.strokes) ? parsed.strokes : [],
            images: Array.isArray(parsed.images) ? parsed.images : [],
        };
    } catch {
        return { canvasSize: null, strokes: [], images: [] };
    }
}

export default function CanvasPage({ session, onBack }) {
    const initial = useMemo(() => parseCanvasContent(session.content), [session.id]);

    const [strokes, setStrokes] = useState(initial.strokes);
    const [images, setImages] = useState(initial.images);
    const [tool, setTool] = useState('pen'); // 'pen' | 'eraser' | 'select'
    const [color, setColor] = useState(PEN_COLORS[0]);
    const [thickness, setThickness] = useState(PEN_THICKNESSES[1]);
    const [penOnly, setPenOnly] = useState(false);
    const [selectedImageId, setSelectedImageId] = useState(null);
    const [liveTick, setLiveTick] = useState(0);

    const liveStrokeRef = useRef(null);
    const rafScheduled = useRef(false);
    const undoStack = useRef([]);
    const redoStack = useRef([]);
    const eraseSnapshotTaken = useRef(false);
    const canvasSizeRef = useRef(initial.canvasSize);
    const saveTimeout = useRef(null);

    const scheduleLiveUpdate = () => {
        if (rafScheduled.current) return;
        rafScheduled.current = true;
        requestAnimationFrame(() => {
            rafScheduled.current = false;
            setLiveTick((t) => t + 1);
        });
    };

    const scheduleSave = useCallback((nextStrokes, nextImages) => {
        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(() => {
            const content = JSON.stringify({
                canvasSize: canvasSizeRef.current,
                strokes: nextStrokes,
                images: nextImages,
            });
            updateSessionContent(session.id, content);
        }, 800);
    }, [session.id]);

    const commitStrokes = (updater) => {
        setStrokes((prev) => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            scheduleSave(next, images);
            return next;
        });
    };

    const commitImages = (updater) => {
        setImages((prev) => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            scheduleSave(strokes, next);
            return next;
        });
    };

    const pushUndoSnapshot = () => {
        undoStack.current.push(JSON.stringify({ strokes, images }));
        if (undoStack.current.length > 50) undoStack.current.shift();
        redoStack.current = [];
    };

    const handleUndo = () => {
        if (undoStack.current.length === 0) return;
        const snap = undoStack.current.pop();
        redoStack.current.push(JSON.stringify({ strokes, images }));
        const { strokes: s2, images: i2 } = JSON.parse(snap);
        setStrokes(s2);
        setImages(i2);
        scheduleSave(s2, i2);
    };

    const handleRedo = () => {
        if (redoStack.current.length === 0) return;
        const snap = redoStack.current.pop();
        undoStack.current.push(JSON.stringify({ strokes, images }));
        const { strokes: s2, images: i2 } = JSON.parse(snap);
        setStrokes(s2);
        setImages(i2);
        scheduleSave(s2, i2);
    };

    const readPoint = (nativeEvent) => {
        const x = nativeEvent.locationX ?? nativeEvent.offsetX ?? 0;
        const y = nativeEvent.locationY ?? nativeEvent.offsetY ?? 0;
        const pressure = nativeEvent.pressure ?? nativeEvent.force ?? 0.5;
        const pointerType = nativeEvent.pointerType;
        return { x, y, pressure, pointerType };
    };

    const eraseAt = (x, y) => {
        commitStrokes((prev) => {
            const hit = prev.some((st) => st.points.some(([px, py]) => Math.hypot(px - x, py - y) < ERASE_RADIUS));
            if (!hit) return prev;
            if (!eraseSnapshotTaken.current) {
                undoStack.current.push(JSON.stringify({ strokes: prev, images }));
                redoStack.current = [];
                eraseSnapshotTaken.current = true;
            }
            return prev.filter((st) => !st.points.some(([px, py]) => Math.hypot(px - x, py - y) < ERASE_RADIUS));
        });
    };

    const handlePointerDown = (e) => {
        const { x, y, pressure, pointerType } = readPoint(e.nativeEvent);
        if (penOnly && pointerType && pointerType !== 'pen') return;
        setSelectedImageId(null);
        if (tool === 'eraser') {
            eraseSnapshotTaken.current = false;
            eraseAt(x, y);
            return;
        }
        if (tool !== 'pen') return;
        liveStrokeRef.current = { id: genId(), color, width: thickness, points: [[x, y, pressure]] };
        scheduleLiveUpdate();
    };

    const handlePointerMove = (e) => {
        const { x, y, pressure, pointerType } = readPoint(e.nativeEvent);
        if (penOnly && pointerType && pointerType !== 'pen') return;
        if (tool === 'eraser') {
            eraseAt(x, y);
            return;
        }
        if (!liveStrokeRef.current) return;
        liveStrokeRef.current.points.push([x, y, pressure]);
        scheduleLiveUpdate();
    };

    const handlePointerUp = () => {
        if (tool !== 'pen') return;
        const stroke = liveStrokeRef.current;
        liveStrokeRef.current = null;
        if (stroke && stroke.points.length > 0) {
            pushUndoSnapshot();
            commitStrokes((prev) => [...prev, stroke]);
        }
        setLiveTick((t) => t + 1);
    };

    const handleLayout = (e) => {
        if (!canvasSizeRef.current) {
            canvasSizeRef.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
        }
    };

    const handleInsertImage = async () => {
        try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
                Alert.alert('Permission needed', 'Allow photo access to insert images.');
                return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 1,
            });
            if (result.canceled || !result.assets?.length) return;

            const asset = result.assets[0];
            const manipulated = await ImageManipulator.manipulateAsync(
                asset.uri,
                [{ resize: { width: 1200 } }],
                { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
            );

            const aspect = manipulated.width && manipulated.height ? manipulated.width / manipulated.height : 1;
            const previewWidth = IMAGE_DEFAULT_MAX_DIM;
            const previewHeight = previewWidth / aspect;
            const cx = (canvasSizeRef.current?.width ?? 300) / 2 - previewWidth / 2;
            const cy = (canvasSizeRef.current?.height ?? 400) / 2 - previewHeight / 2;

            pushUndoSnapshot();
            const image = {
                id: genId(),
                data: manipulated.base64,
                x: Math.max(0, cx),
                y: Math.max(0, cy),
                width: previewWidth,
                height: previewHeight,
            };
            commitImages((prev) => [...prev, image]);
            setTool('select');
            setSelectedImageId(image.id);
        } catch (err) {
            console.error('Insert image failed:', err);
            Alert.alert('Error', 'Could not insert that image.');
        }
    };

    const updateImage = (id, patch) => {
        commitImages((prev) => prev.map((img) => (img.id === id ? { ...img, ...patch } : img)));
    };

    const deleteSelectedImage = () => {
        if (!selectedImageId) return;
        pushUndoSnapshot();
        commitImages((prev) => prev.filter((img) => img.id !== selectedImageId));
        setSelectedImageId(null);
    };

    const strokePaths = useMemo(
        () => strokes.map((st) => ({ st, path: Skia.Path.MakeFromSVGString(svgPathFromPoints(st.points)) })),
        [strokes]
    );

    const liveStroke = liveStrokeRef.current;
    const livePath = useMemo(() => {
        if (!liveStroke) return null;
        return Skia.Path.MakeFromSVGString(svgPathFromPoints(liveStroke.points));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveTick]);

    return (
        <View style={s.container}>
            <View style={s.header}>
                <TouchableOpacity onPress={onBack} style={s.iconBtn}>
                    <Ionicons name="chevron-back" size={28} color={COLORS.primary} />
                </TouchableOpacity>
                <Text style={s.title} numberOfLines={1}>{session.name}</Text>
                <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity onPress={handleUndo} style={s.iconBtn}>
                        <Ionicons name="arrow-undo" size={22} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleRedo} style={s.iconBtn}>
                        <Ionicons name="arrow-redo" size={22} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                </View>
            </View>

            <View
                style={s.canvasWrap}
                onLayout={handleLayout}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                pointerEvents={tool === 'select' ? 'none' : 'auto'}
            >
                <Canvas style={StyleSheet.absoluteFill}>
                    {strokePaths.map(({ st, path }) => path && (
                        <Path key={st.id} path={path} style="stroke" strokeWidth={strokeWidthFor(st.width, st.points)} strokeCap="round" strokeJoin="round" color={st.color} />
                    ))}
                    {livePath && (
                        <Path path={livePath} style="stroke" strokeWidth={strokeWidthFor(liveStroke.width, liveStroke.points)} strokeCap="round" strokeJoin="round" color={liveStroke.color} />
                    )}
                </Canvas>
            </View>

            <View style={[StyleSheet.absoluteFill, { top: 60 }]} pointerEvents={tool === 'select' ? 'box-none' : 'none'}>
                {images.map((img) => (
                    <DraggableImage
                        key={img.id}
                        image={img}
                        selected={selectedImageId === img.id}
                        onSelect={() => setSelectedImageId(img.id)}
                        onChange={(patch) => updateImage(img.id, patch)}
                        onDragEnd={pushUndoSnapshot}
                    />
                ))}
            </View>

            <View style={s.toolbar}>
                <View style={s.toolGroup}>
                    <ToolButton icon="pencil" active={tool === 'pen'} onPress={() => setTool('pen')} />
                    <ToolButton icon="backspace-outline" active={tool === 'eraser'} onPress={() => setTool('eraser')} />
                    <ToolButton icon="move" active={tool === 'select'} onPress={() => setTool('select')} />
                    <ToolButton icon="image" active={false} onPress={handleInsertImage} />
                    {tool === 'select' && selectedImageId && (
                        <ToolButton icon="trash" active={false} onPress={deleteSelectedImage} color={COLORS.accentRed} />
                    )}
                </View>

                {tool === 'pen' && (
                    <>
                        <View style={s.row}>
                            {PEN_COLORS.map((c) => (
                                <TouchableOpacity key={c} onPress={() => setColor(c)} style={[s.swatch, { backgroundColor: c }, color === c && s.swatchActive]} />
                            ))}
                        </View>
                        <View style={s.row}>
                            {PEN_THICKNESSES.map((t) => (
                                <TouchableOpacity key={t} onPress={() => setThickness(t)} style={[s.thicknessBtn, thickness === t && s.thicknessBtnActive]}>
                                    <View style={{ width: t * 2, height: t * 2, borderRadius: t, backgroundColor: COLORS.textPrimary }} />
                                </TouchableOpacity>
                            ))}
                        </View>
                        <View style={s.row}>
                            <Text style={s.penOnlyLabel}>S Pen only</Text>
                            <Switch value={penOnly} onValueChange={setPenOnly} trackColor={{ true: COLORS.primary }} />
                        </View>
                    </>
                )}
            </View>
        </View>
    );
}

const ToolButton = ({ icon, active, onPress, color }) => (
    <TouchableOpacity onPress={onPress} style={[s.toolBtn, active && s.toolBtnActive]}>
        <Ionicons name={icon} size={20} color={color ?? (active ? COLORS.primary : COLORS.textSecondary)} />
    </TouchableOpacity>
);

const DraggableImage = ({ image, selected, onSelect, onChange, onDragEnd }) => {
    const start = useRef({ x: image.x, y: image.y, width: image.width, height: image.height });

    const panGesture = useMemo(
        () => Gesture.Pan()
            .onBegin(() => { start.current = { x: image.x, y: image.y, width: image.width, height: image.height }; })
            .onUpdate((e) => onChange({ x: start.current.x + e.translationX, y: start.current.y + e.translationY }))
            .onEnd(() => onDragEnd())
            .onTouchesDown(() => onSelect()),
        [image.x, image.y]
    );

    const resizeGesture = useMemo(
        () => Gesture.Pan()
            .onBegin(() => { start.current = { x: image.x, y: image.y, width: image.width, height: image.height }; })
            .onUpdate((e) => {
                const width = Math.max(40, start.current.width + e.translationX);
                const aspect = start.current.width / start.current.height;
                onChange({ width, height: width / aspect });
            })
            .onEnd(() => onDragEnd()),
        [image.width, image.height]
    );

    return (
        <GestureDetector gesture={panGesture}>
            <View style={{ position: 'absolute', left: image.x, top: image.y, width: image.width, height: image.height }}>
                <View style={[s.imageFrame, selected && s.imageFrameSelected]}>
                    <ImageBase64 data={image.data} width={image.width} height={image.height} />
                </View>
                {selected && (
                    <GestureDetector gesture={resizeGesture}>
                        <View style={s.resizeHandle} />
                    </GestureDetector>
                )}
            </View>
        </GestureDetector>
    );
};

const ImageBase64 = ({ data, width, height }) => {
    if (!data) return <View style={{ width, height, backgroundColor: COLORS.surfaceHighlight }} />;
    return <Image source={{ uri: `data:image/jpeg;base64,${data}` }} style={{ width, height }} resizeMode="contain" />;
};

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.lg, minHeight: 60 },
    title: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, flex: 1, marginHorizontal: SPACING.sm },
    iconBtn: { padding: SPACING.sm },

    canvasWrap: { flex: 1, backgroundColor: COLORS.surface },

    toolbar: { borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surfaceLight, padding: SPACING.md },
    toolGroup: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
    toolBtn: { width: 40, height: 40, borderRadius: BORDER_RADIUS.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface },
    toolBtnActive: { backgroundColor: COLORS.surfaceHighlight, borderWidth: 1, borderColor: COLORS.primary },

    row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
    swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
    swatchActive: { borderColor: COLORS.textPrimary },
    thicknessBtn: { width: 36, height: 36, borderRadius: BORDER_RADIUS.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface },
    thicknessBtnActive: { borderWidth: 1, borderColor: COLORS.primary },
    penOnlyLabel: { color: COLORS.textSecondary, fontSize: 14, flex: 1 },

    imageFrame: { width: '100%', height: '100%', borderWidth: 1, borderColor: 'transparent', overflow: 'hidden' },
    imageFrameSelected: { borderColor: COLORS.primary, borderStyle: 'dashed' },
    resizeHandle: { position: 'absolute', right: -8, bottom: -8, width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.primary },
});
