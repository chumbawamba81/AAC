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
    const { to } = await req.json() as { to: string };

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

    const body = `Estimada/o encarregada/o de educação,

Vimos por este meio notificar que tem mensalidades/trimestre em atraso.
Agradecemos a sua liquidação com a máxima celeridade.



Com os melhores cumprimentos,

A Direção da Associação Académica de Coimbra - Secção de Basquetebol`;

    await transporter.sendMail({
      from: EMAIL_LOGIN,
      to: to.trim(),
      subject: "AAC-SB - Mensalidades/Trimestre em Atraso",
      text: body,
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
