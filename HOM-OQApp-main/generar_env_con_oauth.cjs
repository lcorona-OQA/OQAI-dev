const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(pregunta) {
  return new Promise((resolve) => rl.question(pregunta, resolve));
}

(async () => {
  console.log('--- Configuración de Gmail con OAuth2 ---');

  const CLIENT_ID = await ask('📥 CLIENT_ID: ');
  const CLIENT_SECRET = await ask('🔑 CLIENT_SECRET: ');
  const EMAIL_ORIGEN = await ask('📧 Tu correo de Gmail: ');

  const REDIRECT_URI = 'https://developers.google.com/oauthplayground';

  const oAuth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
  );

  const SCOPES = ['https://mail.google.com/'];

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Fuerza generación de refresh_token
  });

  console.log('\n🔗 Abre este enlace y autoriza el acceso:\n' + authUrl);

  const code = await ask('\n📥 Pega el código de autorización aquí: ');

  try {
    const { tokens } = await oAuth2Client.getToken(code);

    if (!tokens.refresh_token) {
      console.warn('\n⚠️ No se generó un refresh_token. Asegúrate de usar "prompt: consent". Vuelve a intentarlo.');
      rl.close();
      return;
    }

    const envContent = `
VITE_GMAIL_CLIENT_ID=${CLIENT_ID}
VITE_GMAIL_CLIENT_SECRET=${CLIENT_SECRET}
VITE_GMAIL_REFRESH_TOKEN=${tokens.refresh_token}
VITE_GMAIL_SENDER=${EMAIL_ORIGEN}
`.trim();

    fs.writeFileSync('.env', envContent);
    console.log('\n✅ Archivo .env generado con éxito:\n');
    console.log(envContent);
  } catch (err) {
    console.error('❌ Error al obtener los tokens:', err.message);
  } finally {
    rl.close();
  }
})();
