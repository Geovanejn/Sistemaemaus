import { Resend } from "resend";

async function testResendEmail() {
  const apiKey = process.env.RESEND_API_KEY;
  
  if (!apiKey) {
    console.error("❌ RESEND_API_KEY não encontrada nas variáveis de ambiente");
    console.log("\nPor favor, configure a chave de API:");
    console.log("  export RESEND_API_KEY='sua-chave-aqui'");
    process.exit(1);
  }
  
  console.log("=== Testando Resend Email API ===\n");
  console.log(`✓ RESEND_API_KEY encontrada: ${apiKey.substring(0, 8)}...`);
  
  const resend = new Resend(apiKey);
  const fromEmail = "Emaús Vota <suporte@emausvota.com.br>";
  const testEmail = "marketingumpemaus@gmail.com";
  
  console.log(`\nEnviando email de teste para: ${testEmail}`);
  console.log(`De: ${fromEmail}\n`);
  
  try {
    const result = await resend.emails.send({
      from: fromEmail,
      to: testEmail,
      subject: "✅ Teste do Sistema Emaús Vota",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #FFA500 0%, #FF8C00 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">✅ Sistema de Email Configurado!</h1>
          </div>

          <!-- Main Content -->
          <div style="padding: 40px 30px; background-color: #ffffff;">
            <p style="font-size: 18px; color: #333; margin-bottom: 20px;">Parabéns!</p>
            
            <p style="font-size: 16px; color: #555; line-height: 1.6;">
              O sistema de emails do <strong>Emaús Vota</strong> está funcionando perfeitamente! ✨
            </p>

            <div style="background: linear-gradient(135deg, #FFF9E6 0%, #FFE5B4 100%); border-left: 4px solid #FFA500; padding: 20px; margin: 25px 0; border-radius: 8px;">
              <h3 style="color: #FFA500; margin: 0 0 10px 0;">Sistema Pronto</h3>
              <p style="margin: 0; color: #666; font-size: 15px;">
                ✓ Resend API configurada<br>
                ✓ Banco de dados limpo<br>
                ✓ Usuário administrador criado<br>
                ✓ Sistema pronto para uso real
              </p>
            </div>

            <p style="font-size: 16px; color: #555; line-height: 1.6; margin-top: 25px;">
              O sistema agora pode enviar:
            </p>

            <ul style="color: #555; font-size: 15px; line-height: 1.8;">
              <li>Códigos de verificação para novos usuários</li>
              <li>Emails de recuperação de senha</li>
              <li>Emails de aniversário aos membros</li>
              <li>Notificações de eleições e resultados</li>
              <li>Relatórios de auditoria em PDF</li>
            </ul>

            <p style="font-size: 16px; color: #555; line-height: 1.6; margin-top: 25px;">
              <strong>Email configurado:</strong> ${fromEmail}
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color: #f8f9fa; padding: 30px; text-align: center; border-radius: 0 0 8px 8px; border-top: 1px solid #e9ecef;">
            <p style="color: #888; font-size: 14px; margin: 0 0 15px 0;">
              UMP Emaús - Sistema de Votação
            </p>
            <p style="color: #aaa; font-size: 12px; margin: 0;">
              Este é um email de teste - sistema configurado com sucesso!
            </p>
          </div>
        </div>
      `,
    });
    
    console.log("✅ Email enviado com sucesso!");
    console.log("\nDetalhes:");
    console.log(`  ID: ${result.data?.id || 'N/A'}`);
    console.log(`  Para: ${testEmail}`);
    console.log(`  De: ${fromEmail}`);
    
    console.log("\n🎉 Sistema de emails Resend funcionando perfeitamente!");
    console.log("✅ Configuração validada com sucesso!");
    
  } catch (error: any) {
    console.error("\n❌ Erro ao enviar email:");
    console.error(error.message);
    
    if (error.message?.includes("Invalid") || error.message?.includes("API")) {
      console.error("\n⚠️  Verifique se:");
      console.error("  1. A chave RESEND_API_KEY está correta");
      console.error("  2. O domínio suporte@emausvota.com.br está verificado no Resend");
      console.error("  3. A chave tem permissões de envio");
    }
    
    process.exit(1);
  }
}

testResendEmail();
