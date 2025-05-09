// --- Imports ---
const express = require('express');
const axios = require('axios');

// --- App Setup ---
const app = express();
app.use(express.json());

// --- Configuration ---
const RAW_TOKEN = "EAAIawFZBhcgoBOZCRQcaGUqtziF65PIv3YSZCJ4oTkKIm2ICTVOzOee4PTxXrjAN8sByUsygjz4SxAfIkit6vZB9ccxNyDaa99GJytE9vESBoExUZAMZAsGzZAHOtZBb3ZBfsoPj0YKcKZBTQsY9KctqpU8pPSp4UIfRWN8OFt7oKkDXD9joTxf20ZCg1pfHL8DPdsFLjk1SBRWAZBZAn78HcsHOJBZCwZD";
const WABA_TOKEN = RAW_TOKEN.trim().replace(/\r/g, '').replace(/\n/g, '');
console.log('[DEBUG] WABA_TOKEN length:', WABA_TOKEN.length);

const WABA_PHONE_NUMBER_ID = '616068288261158';

// Números de ejecutivos disponibles
const EXECUTIVES = ['56979743683', '56956291916'];

// --- In-memory Session Maps ---
const clientToExec = new Map();
const execToClient = new Map();

// --- Axios Instance ---
const whatsappApi = axios.create({
  baseURL: `https://graph.facebook.com/v22.0/${WABA_PHONE_NUMBER_ID}/messages`,
  headers: { Authorization: `Bearer ${WABA_TOKEN}` },
});


async function sendTextMessage(to, text) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { preview_url: false, body: text },
  };
  try {
    return await whatsappApi.post('', payload);
  } catch (error) {
    console.error('[ERROR] sendTextMessage:', error.response?.data || error.message);
    throw error;
  }
}

async function sendButtonMessage(to, bodyText, buttons) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: { buttons: buttons.map(({ id, title }) => ({ type: 'reply', reply: { id, title } })) }
    }
  };
  try {
    return await whatsappApi.post('', payload);
  } catch (error) {
    console.error('[ERROR] sendButtonMessage:', error.response?.data || error.message);
    throw error;
  }
}

// --- Handlers ---
async function handleButtonReply(from, payload) {
  switch (payload) {
    case 'ayuda_factura':
      return sendTextMessage(from, 'Aquí tienes información sobre facturas...');
    case 'info_producto':
      return sendTextMessage(from, 'Estos son nuestros productos y sus características...');
    case 'hablar_ejecutivo': {
      // Asignar primer ejecutivo libre
      const available = EXECUTIVES.find(exec => !execToClient.has(exec));
      if (!available) {
        return sendTextMessage(from, 'Lo siento, todos nuestros ejecutivos están ocupados. Intenta nuevamente más tarde.');
      }
      clientToExec.set(from, available);
      execToClient.set(available, from);
      await sendTextMessage(from, 'Entendido, un ejecutivo te atenderá en breve.');
      return sendTextMessage(available, `📨 *Nuevo cliente solicita ejecutivo*\n*De:* +${from}`);
    }
    default:
      return sendTextMessage(from, 'Lo siento, no entendí tu selección.');
  }
}

async function handleExecutiveMessage(from, text) {
  const client = execToClient.get(from);
  if (!client) return;
  const lowerText = text.toLowerCase();
  const endSession = lowerText.includes('finalizar') || lowerText.includes('cerrar');
  if (endSession) {
    await sendTextMessage(client, 'La conversación ha sido finalizada por el ejecutivo. ¡Gracias!');
    clientToExec.delete(client);
    execToClient.delete(from);
  } else {
    await sendTextMessage(client, `Ejecutivo: ${text}`);
  }
}

async function handleClientMessage(from) {
  console.log('🚀 Primer mensaje de cliente, enviando menú de botones');
  const buttons = [
    { id: 'ayuda_factura', title: 'Soporte facturas' },
    { id: 'info_producto', title: 'Info de producto' },
    { id: 'hablar_ejecutivo', title: 'Hablar ejecutivo' }
  ];
  return sendButtonMessage(from, 'Hola! Bienvenido a MILLACERO, ¿En qué puedo ayudarte?', buttons);
}

// --- Webhook Endpoint ---
app.post('/webhook', async (req, res) => {
  console.log('\n--- Webhook recibido ---');
  console.log(JSON.stringify(req.body, null, 2));
  res.sendStatus(200);

  const change = req.body.entry?.[0]?.changes?.[0];
  if (!change || change.value.statuses) return;

  const msg = change.value.messages?.[0];
  if (!msg) return;

  const from = msg.from;
  const text = msg.text?.body?.trim() || '';
  console.log(`📥 Mensaje de ${from}:`, msg.interactive?.type ? '(interactive)' : text);

  // 1) Botón pulsado
  if (msg.interactive?.type === 'button_reply') {
    return handleButtonReply(from, msg.interactive.button_reply.id);
  }

  // 2) Mensaje de ejecutivo en sesión
  if (execToClient.has(from)) {
    return handleExecutiveMessage(from, text);
  }

  // 3) Primer mensaje de cliente sin sesión
  if (!clientToExec.has(from)) {
    try {
      return handleClientMessage(from);
    } catch (err) {
      console.error('Error enviando menú al cliente:', err);
    }
    return;
  }

  // 4) Reenvío cliente → ejecutivo
  const exec = clientToExec.get(from);
  console.log(`➡️ Reenviando cliente(${from}) → ejecutivo(${exec})`);
  return sendTextMessage(exec, `Cliente (+${from}): ${text}`);
});

// --- Server Startup ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server corriendo en http://localhost:${PORT}`));


