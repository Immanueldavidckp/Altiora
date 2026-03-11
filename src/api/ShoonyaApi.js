// Pure JS SHA256 implementation
const sha256 = (ascii) => {
    function rightRotate(value, amount) {
        return (value >>> amount) | (value << (32 - amount));
    }
    var mathPow = Math.pow;
    var maxWord = mathPow(2, 32);
    var lengthProperty = 'length';
    var i, j;
    var result = '';
    var words = [];
    var asciiBitLength = ascii[lengthProperty] * 8;
    var hash = sha256.h = sha256.h || [];
    var k = sha256.k = sha256.k || [];
    var primeCounter = k[lengthProperty];
    var isPrime = [2];
    var getWords = function(offsets) {
        return offsets.map(function(o) { return words[o]; });
    };

    if (!primeCounter) {
        for (i = 3; primeCounter < 64; i += 2) {
            if (isPrime.every(function(p) { return i % p; })) {
                isPrime.push(i);
                k[primeCounter++] = (mathPow(i, 1 / 3) * maxWord) | 0;
            }
        }
        for (i = 0; i < 8; i++) {
            hash[i] = (mathPow(isPrime[i], 1 / 2) * maxWord) | 0;
        }
    }

    ascii += '\x80';
    while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii[lengthProperty]; i++) {
        j = ascii.charCodeAt(i);
        if (j >> 8) return;
        words[i >> 2] |= j << ((3 - i % 4) * 8);
    }
    words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
    words[words[lengthProperty]] = (asciiBitLength | 0);

    for (j = 0; j < words[lengthProperty]; j += 16) {
        var w = words.slice(j, j + 16);
        var oldHash = hash.slice(0);
        for (i = 0; i < 64; i++) {
            if (i < 16) {
                var w_i = w[i];
            } else {
                var s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
                var s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
                var w_i = w[i];
            }

            var S1 = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
            var ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
            var temp1 = (hash[7] + S1 + ch + k[i] + w_i) | 0;
            var S0 = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
            var maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
            var temp2 = (S0 + maj) | 0;

            hash = [(temp1 + temp2) | 0].concat(hash);
            hash[4] = (hash[4] + temp1) | 0;
            hash.length = 8;
        }

        for (i = 0; i < 8; i++) {
            hash[i] = (hash[i] + oldHash[i]) | 0;
        }
    }

    for (i = 0; i < 8; i++) {
        for (j = 3; j + 1; j--) {
            var b = (hash[i] >> (j * 8)) & 255;
            result += (b < 16 ? '0' : '') + b.toString(16);
        }
    }
    return result;
};

import CryptoJS from 'crypto-js';

const generateTOTP = (secret) => {
    try {
        const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let bits = '';
        let hex = '';
        
        secret = secret.replace(/=+$/, '').toUpperCase();
        
        for (let i = 0; i < secret.length; i++) {
            let val = base32chars.indexOf(secret.charAt(i));
            if(val === -1) continue;
            bits += val.toString(2).padStart(5, '0');
        }
        
        for (let i = 0; i < bits.length - 3; i += 4) {
            const chunk = bits.substring(i, i + 4);
            hex += parseInt(chunk, 2).toString(16);
        }
        
        let time = Math.floor(Date.now() / 1000 / 30);
        let timeHex = time.toString(16).padStart(16, '0');
        
        const hmac = CryptoJS.HmacSHA1(
            CryptoJS.enc.Hex.parse(timeHex),
            CryptoJS.enc.Hex.parse(hex)
        );
        const hmacHex = hmac.toString(CryptoJS.enc.Hex);
        
        const offset = parseInt(hmacHex.substring(hmacHex.length - 1), 16) * 2;
        let totp = (parseInt(hmacHex.substring(offset, offset + 8), 16) & 0x7fffffff) + '';
        
        totp = totp.substring(totp.length - 6);
        return totp.padStart(6, '0');
    } catch(e) {
        console.error('TOTP Generate Error:', e);
        return '000000';
    }
};
class ShoonyaApi {
    constructor() {
        this.baseUrl = 'https://api.shoonya.com/NorenWClientTP/';
        this.token = null;
        this.uid = null;
        this.actid = null;
    }

    async request(endpoint, data = {}) {
        try {
            const body = 'jData=' + JSON.stringify({ ...data, uid: this.uid, susertoken: this.token });
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body
            });
            return await response.json();
        } catch (e) {
            console.error(`Shoonya API Error [${endpoint}]:`, e);
            return { stat: 'Not_Ok', emsg: 'Network Error' };
        }
    }

    async login(config) {
        const { userId, password, apiKey, vendorCode, imei, totpSecret, actid } = config;
        this.uid = userId;
        this.actid = actid || userId;

        const hashedPwd = sha256(password);
        const hashedKey = sha256(userId + '|' + apiKey);
        
        // We'll use a dynamic TOTP if we have the secret
        let factor2 = '';
        try {
            factor2 = generateTOTP(totpSecret);
        } catch (e) {
            console.error('TOTP Generation Failed:', e);
            throw new Error('TOTP Library Missing');
        }

        const payload = {
            apkversion: '1.0.0',
            uid: userId,
            pwd: hashedPwd,
            factor2: factor2,
            vc: vendorCode,
            appkey: hashedKey,
            imei: imei || 'ALT123456789'
        };

        const response = await fetch(`${this.baseUrl}QuickAuth`, {
            method: 'POST',
            body: 'jData=' + JSON.stringify(payload)
        });

        const resData = await response.json();
        if (resData.stat === 'Ok') {
            this.token = resData.susertoken;
            return { success: true, data: resData };
        } else {
            return { success: false, message: resData.emsg };
        }
    }

    async getLimits() {
        return await this.request('Limits', { actid: this.actid });
    }

    async placeOrder(order) {
        // immediate order placement
        const payload = {
            actid: this.actid,
            exch: order.exch || 'NSE',
            tsym: order.tsym,
            qty: order.qty.toString(),
            prd: order.prd || 'M', // MIS
            trantype: order.trantype, // B or S
            prctyp: order.prctyp || 'MKT',
            prc: order.prc || '0',
            ret: 'DAY',
            remarks: 'AltioraQuickOrder'
        };
        return await this.request('PlaceOrder', payload);
    }

    async getTradeBook() {
        return await this.request('TradeBook', { actid: this.actid });
    }
    
    async getPositions() {
        return await this.request('PositionBook', { actid: this.actid });
    }
}

export default new ShoonyaApi();
