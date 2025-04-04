require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const mongoose = require('mongoose');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// Define Conversation schema
const messageSchema = new mongoose.Schema({
  role: String,
  content: String
});

const conversationSchema = new mongoose.Schema({
  user: String,
  messages: [messageSchema],
  updatedAt: { type: Date, default: Date.now }
});

const Conversation = mongoose.model('Conversation', conversationSchema);

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

function extractMediaUrl(text) {
  const urlRegex = /(https?:\/\/[\w\-._~:/?#\[\]@!$&'()*+,;=]+\.(mp4|mov|jpg|jpeg|png|gif))/gi;
  const match = text.match(urlRegex);
  return match ? match[0] : null;
}

app.post('/webhook', async (req, res) => {
  const incomingMsg = req.body.Body;
  const from = req.body.From;
  const numMedia = parseInt(req.body.NumMedia);

  console.log(`Received from ${from}: ${incomingMsg}`);

  try {
    if (numMedia > 0) {
      const mediaUrl = req.body.MediaUrl0;
      const mediaType = req.body.MediaContentType0;
      console.log(`📷 Received media: ${mediaUrl} (${mediaType})`);

      await client.messages.create({
        from: process.env.TWILIO_PHONE_NUMBER,
        to: from,
        body: `קיבלתי את הקובץ שלך (${mediaType})! תודה 😊`
      });

      return res.sendStatus(200);
    }

    let convo = await Conversation.findOne({ user: from });
    if (!convo) {
      convo = new Conversation({ user: from, messages: [] });
    }

    convo.messages.push({ role: 'user', content: incomingMsg });
    const context = convo.messages.slice(-10);

    const openaiRes = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'אתה קאוצ׳ר אישי שמתמחה בתזונה, בריאות וכושר. אם יש סרטון או תמונה שיכולים לעזור מאוד באופן מדויק, ציין קישור ישיר לקובץ (כמו mp4, jpg). אם אין התאמה מדויקת ומועילה, אל תוסיף קישור בכלל.' },
        ...context
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const reply = openaiRes.data.choices[0].message.content;
    convo.messages.push({ role: 'assistant', content: reply });
    await convo.save();

    // Always send the full reply first
    await client.messages.create({
      from: process.env.TWILIO_PHONE_NUMBER,
      to: from,
      body: reply
    });

    // Then, if a media file is included and clearly relevant, send it separately
    const mediaUrl = extractMediaUrl(reply);
    if (mediaUrl && reply.toLowerCase().includes(mediaUrl.toLowerCase())) {
      await client.messages.create({
        from: process.env.TWILIO_PHONE_NUMBER,
        to: from,
        mediaUrl: [mediaUrl]
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Error handling message:', err);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
