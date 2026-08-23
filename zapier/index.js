'use strict';

const { version } = require('./package.json');
const { version: platformVersion } = require('zapier-platform-core');

const authentication = require('./authentication');
const { addApiKey, handleErrors } = require('./middleware');
const hydrators = require('./hydrators');
const transcriptCompleted = require('./triggers/transcriptCompleted');
const createTranscriptFromUrl = require('./creates/createTranscriptFromUrl');
const createTranscriptFromFile = require('./creates/createTranscriptFromFile');
const exportTranscript = require('./creates/exportTranscript');
const findTranscript = require('./searches/findTranscript');

module.exports = {
  version,
  platformVersion,
  authentication,
  beforeRequest: [addApiKey],
  afterResponse: [handleErrors],
  hydrators,
  triggers: { [transcriptCompleted.key]: transcriptCompleted },
  creates: {
    [createTranscriptFromUrl.key]: createTranscriptFromUrl,
    [createTranscriptFromFile.key]: createTranscriptFromFile,
    [exportTranscript.key]: exportTranscript,
  },
  searches: { [findTranscript.key]: findTranscript },
};
