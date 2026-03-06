import * as Location from 'expo-location';

export const getCurrentLocation = async () => {
    try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            console.warn('Permission to access location was denied');
            return null;
        }

        let location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
        });

        const { latitude, longitude } = location.coords;

        let geocode = await Location.reverseGeocodeAsync({
            latitude,
            longitude,
        });

        let locationName = 'Unknown Location';
        if (geocode && geocode.length > 0) {
            const place = geocode[0];
            locationName = `${place.name || place.district || ''}, ${place.city || place.subregion || ''}`.trim();
            if (locationName.startsWith(',')) locationName = locationName.substring(1).trim();
            if (locationName.endsWith(',')) locationName = locationName.slice(0, -1).trim();
        }

        return {
            latitude,
            longitude,
            locationName,
        };
    } catch (error) {
        console.error('Error getting location:', error);
        return null;
    }
};
