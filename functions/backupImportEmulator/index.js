const admin = require('../node_modules/firebase-admin');

admin.initializeApp();

// The emulator fixture exposes the production backup API without unrelated triggers.
exports.backupApi = require('../backupApi').backupApi;
