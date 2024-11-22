// models/Client.js

const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  phone: { type: String, required: true },
  // Ajoutez d'autres champs si nécessaire
});

module.exports = mongoose.model('Client', clientSchema);
