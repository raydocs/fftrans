'use strict';

// request module
const requestModule = require('../system/request-module');
const configModule = require('../system/config-module');

// Default public token (may be rate-limited or revoked)
const DEFAULT_TOKEN = 'token lqkr1tfixq1wa9kmj9po';

// translate
async function exec(option) {
  const config = configModule.getConfig();
  const token = config.api.caiyunToken || DEFAULT_TOKEN;

  const response = await requestModule.post(
    'https://api.interpreter.caiyunai.com/v1/translator',
    {
      source: option.text,
      trans_type: `${option.from}2${option.to}`,
      replaced: true,
      detect: true,
      media: 'text',
      request_id: '5a096eec830f7876a48aac47',
    },
    {
      'Content-Type': 'application/json',
      'x-authorization': token.startsWith('token ') ? token : `token ${token}`,
    }
  );

  return response.data.target;
}

// module exports
module.exports = { exec };
