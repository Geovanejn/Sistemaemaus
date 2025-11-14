import type { Env } from "./types";

/**
 * Send verification email using Resend API
 * Uses direct fetch API instead of Node.js Resend SDK
 */
export async function sendVerificationEmail(
  email: string, 
  code: string,
  env: Env
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[EMAIL DISABLED] Verification code for ${email}: ${code}`);
    return false;
  }
  
  const fromEmail = env.RESEND_FROM_EMAIL || "Emaús Vota <suporte@emausvota.com.br>";
  
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: email,
        subject: "Seu código de verificação - Emaús Vota",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #FFA500;">Emaús Vota</h2>
            <p>Olá,</p>
            <p>Seu código de verificação para primeiro acesso é:</p>
            <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
              <h1 style="color: #FFA500; font-size: 32px; letter-spacing: 8px; margin: 0;">${code}</h1>
            </div>
            <p>Este código expira em 15 minutos.</p>
            <p>Se você não solicitou este código, ignore este email.</p>
            <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;">
            <p style="color: #888; font-size: 12px;">UMP Emaús - Sistema de Votação</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`Resend API error: ${response.status} - ${errorData}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error sending verification email:", error);
    return false;
  }
}

/**
 * Send password reset email using Resend API
 */
export async function sendPasswordResetEmail(
  email: string,
  code: string,
  env: Env
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[EMAIL DISABLED] Password reset code for ${email}: ${code}`);
    return false;
  }
  
  const fromEmail = env.RESEND_FROM_EMAIL || "Emaús Vota <suporte@emausvota.com.br>";
  
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: email,
        subject: "🔒 Recuperação de Senha - Emaús Vota",
        html: `
          <div style="font-family: 'Arial', sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #FFA500 0%, #FF8C00 100%); padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: bold;">🔒 Recuperação de Senha</h1>
            </div>

            <!-- Main Content -->
            <div style="padding: 40px 30px; background-color: #ffffff;">
              <p style="font-size: 16px; color: #333; margin-bottom: 20px;">Olá!</p>
              
              <p style="font-size: 15px; color: #555; line-height: 1.6;">
                Você solicitou a recuperação de senha para sua conta no sistema Emaús Vota.
              </p>

              <p style="font-size: 15px; color: #555; line-height: 1.6; margin-top: 20px;">
                Use o código abaixo para recuperar sua senha:
              </p>

              <!-- Code Card -->
              <div style="background: linear-gradient(135deg, #FFF9E6 0%, #FFE5B4 100%); border-left: 4px solid #FFA500; padding: 25px; margin: 25px 0; border-radius: 8px; text-align: center;">
                <p style="margin: 0 0 10px 0; color: #666; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Código de Recuperação</p>
                <h1 style="color: #FFA500; margin: 0; font-size: 32px; letter-spacing: 8px; font-weight: bold;">${code}</h1>
              </div>

              <div style="background-color: #FFF3CD; border-left: 4px solid #FFA500; padding: 15px; margin: 25px 0; border-radius: 4px;">
                <p style="margin: 0; color: #856404; font-size: 14px;">
                  <strong>⏱️ Atenção:</strong> Este código expira em <strong>15 minutos</strong>.
                </p>
              </div>

              <p style="font-size: 15px; color: #555; line-height: 1.6; margin-top: 25px;">
                Após inserir o código, você será solicitado a criar uma nova senha para sua conta.
              </p>

              <p style="font-size: 14px; color: #888; line-height: 1.6; margin-top: 25px; padding-top: 25px; border-top: 1px solid #eee;">
                <strong>Não solicitou esta recuperação?</strong><br>
                Se você não solicitou a recuperação de senha, ignore este email. Sua senha atual permanecerá inalterada.
              </p>
            </div>

            <!-- Footer -->
            <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #6c757d; font-size: 12px;">
                UMP Emaús - Sistema de Votação
              </p>
            </div>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`Resend API error: ${response.status} - ${errorData}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error sending password reset email:", error);
    return false;
  }
}
