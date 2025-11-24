'use strict';

const vision = require('@google-cloud/vision');

const configModule = require('../system/config-module');

const fileModule = require('../system/file-module');

const requestModule = require('../system/request-module');

async function textDetection(input) {
  const config = configModule.getConfig();

  if (config.api.googleVisionType === 'google-api-key') {
    // API Key
    const apiKey = config.api.googleVisionApiKey;
    const apiUrl = 'https://vision.googleapis.com/v1/images:annotate?key=' + apiKey;
    const header = { 'Content-Type': 'application/json' };

    // Check if input is buffer or path
    const content = Buffer.isBuffer(input) ? input.toString('base64') : fileModule.read(input, 'image');

    const payload = {
      requests: [
        {
          image: {
            content: content,
          },
          features: [
            {
              type: 'TEXT_DETECTION',
            },
          ],
        },
      ],
    };

    const response = await requestModule.post(apiUrl, payload, header);
    return response.data.responses[0].fullTextAnnotation.text;
  } else {
    // JSON
    const keyFilename = fileModule.getUserDataPath('config', 'google-vision-credential.json');
    const client = new vision.ImageAnnotatorClient({ keyFilename: keyFilename });

    // client.textDetection accepts Buffer or filename
    const [result] = await client.textDetection(input);
    const detections = result.textAnnotations[0];
    return detections.description;
  }
}

module.exports = {
  textDetection,
};
