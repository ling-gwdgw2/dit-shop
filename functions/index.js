/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const app = require("../Dit shop (1)/Dit shop/backend/server");

setGlobalOptions({ maxInstances: 10 });

// Force reload trigger: firestore database enabled
exports.api = onRequest({ cors: true }, app);

