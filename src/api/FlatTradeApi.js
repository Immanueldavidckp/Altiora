import CryptoJS from 'crypto-js';

// FlatTrade Pi (Noren) API client.
// Auth is an OAuth-style 3-step flow; the trading/market-data endpoints are
// Noren-based (same shape as the old Shoonya integration).
//
// 1. Open AUTH_URL(apiKey) in a WebView so the user logs in.
// 2. FlatTrade redirects to your configured Redirect URL with ?code=<request_code>.
// 3. Exchange the code for a daily access token via getToken().
// 4. Use that token as jKey for every PiConnect call.

const PICONNECT_URL = 'https://piconnect.flattrade.in/PiConnectTP/';
const TOKEN_URL = 'https://authapi.flattrade.in/trade/apitoken';

export const buildAuthUrl = (apiKey) => `https://auth.flattrade.in/?app_key=${apiKey}`;

class FlatTradeApi {
    constructor() {
        this.baseUrl = PICONNECT_URL;
        this.token = null;   // daily access token (jKey)
        this.uid = null;     // client id
        this.actid = null;   // account id (== client id)
    }

    // Restore a previously-saved session (token reused until it expires daily).
    setSession(clientId, token) {
        this.uid = clientId;
        this.actid = clientId;
        this.token = token;
    }

    clearSession() {
        this.token = null;
        this.uid = null;
        this.actid = null;
    }

    isLoggedIn() {
        return !!this.token;
    }

    // Step 3: exchange the request code for an access token.
    // hash = SHA256(api_key + request_code + api_secret)
    async getToken(apiKey, requestCode, apiSecret) {
        try {
            const hashed = CryptoJS.SHA256(apiKey + requestCode + apiSecret).toString(CryptoJS.enc.Hex);
            const response = await fetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey, request_code: requestCode, api_secret: hashed })
            });
            const data = await response.json();
            if (data && data.stat === 'Ok' && data.token) {
                this.setSession(data.client || this.uid, data.token);
                return { success: true, token: data.token, client: data.client };
            }
            return { success: false, message: (data && (data.emsg || data.message)) || 'Token exchange failed' };
        } catch (e) {
            console.error('FlatTrade getToken error:', e);
            return { success: false, message: 'Network error during token exchange' };
        }
    }

    // Noren request: jData=<json>&jKey=<token>. uid is always required.
    async request(endpoint, data = {}) {
        try {
            const body = 'jData=' + JSON.stringify({ uid: this.uid, ...data }) + '&jKey=' + this.token;
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body
            });
            return await response.json();
        } catch (e) {
            console.error(`FlatTrade API Error [${endpoint}]:`, e);
            return { stat: 'Not_Ok', emsg: 'Network Error' };
        }
    }

    async getLimits() {
        return await this.request('Limits', { actid: this.actid });
    }

    async placeOrder(order) {
        const payload = {
            actid: this.actid,
            exch: order.exch || 'NSE',
            tsym: order.tsym,
            qty: order.qty.toString(),
            prd: order.prd || 'M',
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

    async searchScrip(stext, exch = 'NSE') {
        return await this.request('SearchScrip', { stext, exch });
    }

    async getQuotes(exch, token) {
        return await this.request('GetQuotes', { exch, token });
    }

    async getChartData(exch, token, starttime, endtime, interval = '1') {
        return await this.request('TPSeries', { exch, token, st: starttime, et: endtime, intrv: interval });
    }
}

export default new FlatTradeApi();
