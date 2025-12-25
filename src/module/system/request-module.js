'use strict';

// axios
// some OS can't request with net of Electron
const axios = require('axios');

// http/https for keep-alive connection pooling
const http = require('http');
const https = require('https');
const dns = require('dns');
const { promisify } = require('util');

// config module
const configModule = require('./config-module');

// OPTIMIZATION: DNS caching to reduce DNS lookup time
const dnsLookup = promisify(dns.lookup);
const dnsCache = new Map();
const DNS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL

/**
 * Cached DNS lookup to avoid repeated DNS queries
 * Reduces latency by 50-200ms per request
 */
async function cachedDnsLookup(hostname, options, callback) {
  let lookupOptions = options;
  let lookupCallback = callback;

  if (typeof lookupOptions === 'function') {
    lookupCallback = lookupOptions;
    lookupOptions = undefined;
  }

  if (typeof lookupCallback !== 'function') {
    return;
  }

  const isAll = typeof lookupOptions === 'object' && lookupOptions?.all === true;
  const familyKey = typeof lookupOptions === 'number'
    ? lookupOptions
    : (lookupOptions?.family || 'any');
  const cacheKey = isAll ? `${hostname}|all` : `${hostname}|family:${familyKey}`;

  // Check cache first
  const cached = dnsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < DNS_CACHE_TTL) {
    if (process.env.NODE_ENV !== 'production') {
      const cachedAddress = isAll
        ? cached.addresses?.map((addr) => addr.address).join(', ')
        : cached.address;
      console.log(`[DNS Cache] HIT: ${hostname} -> ${cachedAddress}`);
    }
    if (isAll) {
      return lookupCallback(null, cached.addresses || []);
    }
    return lookupCallback(null, cached.address, cached.family);
  }

  // Cache miss - perform DNS lookup
  try {
    const result = await dnsLookup(hostname, lookupOptions);

    if (Array.isArray(result)) {
      dnsCache.set(cacheKey, {
        addresses: result,
        timestamp: Date.now()
      });

      if (process.env.NODE_ENV !== 'production') {
        const addressList = result.map((addr) => addr.address).join(', ');
        console.log(`[DNS Cache] MISS: ${hostname} -> ${addressList}`);
      }

      return lookupCallback(null, result);
    }

    dnsCache.set(cacheKey, {
      address: result.address,
      family: result.family,
      timestamp: Date.now()
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DNS Cache] MISS: ${hostname} -> ${result.address}`);
    }

    return lookupCallback(null, result.address, result.family);
  } catch (error) {
    return lookupCallback(error);
  }
}

// restricted headers of Chromium
// Additionally, setting the Connection header to the value upgrade is also disallowed.
// const restrictedHeaders = ['Content-Length', 'Host', 'Trailer', 'Te', 'Upgrade', 'Cookie2', 'Keep-Alive', 'Transfer-Encoding'];
const restrictedHeaders = ['content-length', 'host', 'trailer', 'te', 'upgrade', 'cookie2', 'keep-alive', 'transfer-encoding', 'connection'];

// HTTP/HTTPS agents with keep-alive for connection pooling
// This significantly reduces latency by reusing TCP connections
// OPTIMIZATION: Aggressive configuration for game translation workload
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 120000,  // Keep connection alive for 2 minutes (game sessions)
  maxSockets: 50,          // Max concurrent connections per host (high concurrency)
  maxFreeSockets: 20,      // Max idle connections to keep open (more hot connections)
  timeout: 60000           // Socket timeout: 60 seconds
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 120000,  // 2 minutes for persistent gaming sessions
  maxSockets: 50,          // Support high concurrent translation requests
  maxFreeSockets: 20,      // Maintain more warm connections for faster responses
  timeout: 60000,          // Socket timeout: 60 seconds
  lookup: cachedDnsLookup  // OPTIMIZATION: Use cached DNS lookup
});

// sec-ch-ua
let scu = '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"';

// user agent
let userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

// request timeout
const requestTimeout = 10000;

// get
function get(url = '', headers = {}) {
  return new Promise((resolve, reject) => {
    axios.get(url, getOptions(headers)).then(resolve).catch(reject);
  });
}

// post
function post(url = '', data = '', headers = {}) {
  if (typeof data !== 'string') {
    data = JSON.stringify(data);
  }

  return new Promise((resolve, reject) => {
    axios.post(url, data, getOptions(headers)).then(resolve).catch(reject);
  });
}

// get cookie
async function getCookie(url = '', regArray = []) {
  const response = await get(url);
  const setCookie = response.headers['set-cookie'].join('; ');
  const cookie = [];
  const unusedIndex = [];

  for (let index = 0; index < regArray.length; index++) {
    const reg = regArray[index];
    reg.lastIndex = 0;
    const target = reg.exec(setCookie)?.groups?.target;

    if (target) {
      cookie.push(target);
    } else {
      unusedIndex.push(index);
    }
  }

  if (cookie.length === regArray.length) {
    return cookie;
  } else {
    console.log('Unused Index:', unusedIndex);
    throw `Failed to get the cookie from [${url}].`;
  }
}

// clear headers
function clearHeaders(headers = {}) {
  const headerNames = Object.keys(headers);

  for (let index = 0; index < headerNames.length; index++) {
    const headerName = headerNames[index];
    if (restrictedHeaders.includes(headerName.toLowerCase())) {
      delete headers[headerName];
    }
  }

  /*
  if (headers['Connection'] === 'upgrade') {
    delete headers['Connection'];
  }
  */

  return headers;
}

// get expiry date
function getExpiryDate() {
  return new Date().getTime() + 21600000;
}

// get sec-ch-ua
function getSCU() {
  return scu;
}

// set sec-ch-ua
function setSCU(value = []) {
  let notA = null;
  let chromium = null;

  for (let index = 0; index < value.length; index++) {
    const element = value[index];
    if (element.brand !== 'Chromium') {
      notA = element;
    } else {
      chromium = element;
    }
  }

  if (notA && chromium) {
    scu = `"${chromium.brand}";v="${chromium.version}", "${notA.brand}";v="${notA.version}", "Google Chrome";v="${chromium.version}"`;
  }

  return Boolean(notA && chromium);
}

// get user agent
function getUserAgent() {
  return userAgent;
}

// set user agent
function setUserAgent(value = '') {
  userAgent = value
    .replace(/\s+tataru-assistant\/\d+\.\d+\.\d+\s+/gi, ' ')
    .replace(/\s+Electron\/\d+\.\d+\.\d+\s+/gi, ' ')
    .replace(/(Chrome\/\d+)\.\d+\.\d+.\d+/gi, '$1.0.0.0');
}

// set UA
function setUA(scuValue = [], uaValue = '') {
  try {
    if (!(Array.isArray(scuValue) && scuValue.length > 0 && typeof uaValue === 'string' && uaValue.length > 0)) {
      return;
    }

    if (setSCU(scuValue)) {
      setUserAgent(uaValue);
      console.log(scu);
      console.log(userAgent);
    }
  } catch (error) {
    console.log(error);
  }
}

// to parameters
function toParameters(data = {}) {
  const dataNames = Object.keys(data);
  let parameters = [];

  for (let index = 0; index < dataNames.length; index++) {
    const dataName = dataNames[index];
    parameters.push(`${dataName}=${data[dataName]}`);
  }

  return parameters.join('&');
}

// get options
function getOptions(headers = {}) {
  const config = configModule.getConfig();

  const options = {
    headers: clearHeaders(headers),
    timeout: Math.max(requestTimeout, parseInt(config.translation.timeout) * 1000),
    httpAgent: httpAgent,   // Use persistent HTTP connection pool
    httpsAgent: httpsAgent, // Use persistent HTTPS connection pool
  };

  if (config.proxy.enable) {
    const proxy = {
      protocol: config.proxy.protocol.replace(':', ''),
      host: config.proxy.hostname,
      port: parseInt(config.proxy.port),
    };

    if (config.proxy.username && config.proxy.password) {
      proxy.auth = {
        username: config.proxy.username,
        password: config.proxy.password,
      };
    }

    options.proxy = proxy;
  }

  return options;
}

// module exports
module.exports = {
  get,
  post,
  getCookie,
  getExpiryDate,
  getSCU,
  getUserAgent,
  setUA,
  toParameters,
  getHttpAgent: () => httpAgent,
  getHttpsAgent: () => httpsAgent,
};
