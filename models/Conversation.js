const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: String,
  content: String
});

const conversationSchema = new mongoose.Schema({
  user: String,
  messages: [messageSchema],
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Conversation', conversationSchema);
