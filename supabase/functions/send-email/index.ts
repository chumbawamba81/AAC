import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import nodemailer from "npm:nodemailer@6.9.13";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const { to, atletaNome } = await req.json() as { to: string; atletaNome?: string };

    if (!to || !to.trim()) {
      return new Response(
        JSON.stringify({ error: "Endereço de email em falta" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const EMAIL_LOGIN = Deno.env.get("EMAIL_LOGIN");
    const EMAIL_PASSWORD = Deno.env.get("EMAIL_PASSWORD");

    if (!EMAIL_LOGIN || !EMAIL_PASSWORD) {
      return new Response(
        JSON.stringify({ error: "Credenciais não configuradas — corre: supabase secrets set EMAIL_LOGIN=... EMAIL_PASSWORD=..." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: EMAIL_LOGIN,
        pass: EMAIL_PASSWORD,
      },
    });

    const nomeAtleta = atletaNome?.trim() || "";
    const html = `<!doctype html>
<html lang="pt">
  <head>
    <meta charset="UTF-8" />
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <p>Estimada/o encarregada/o de educação,</p>
    <br />
    <p>
      Vimos por este meio notificar que o/a atleta
      <strong>${nomeAtleta}</strong> tem mensalidades/trimestre em atraso.
    </p>
    <br />
    <p>Agradecemos a sua liquidação com a máxima celeridade.</p>
    <br /><br />
    <p>Com os melhores cumprimentos,</p>
    <div class="flex items-center gap-4">
      <img
        src="https://aac-sb.netlify.app/imgs/AAC-white2.png"
        alt="AAC Logo"
        class="w-8 h-8 object-contain"
      />
      <p>
        <strong
          >A Direção da Associação Académica de Coimbra - Secção de
          Basquetebol</strong
        >
      </p>
    </div>
  </body>
</html>
`;

    await transporter.sendMail({
      from: EMAIL_LOGIN,
      to: to.trim(),
      subject: "AAC-SB - Mensalidades/Trimestre em Atraso",
      html,
    });

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[send-email] error:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Erro desconhecido", stack: err?.stack }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
