/**
 * Cloudflare Pages Function: /api/verify-receipt
 * Runs server-side on Cloudflare Workers.
 */

interface Env {
  ANTHROPIC_API_KEY: string;
}

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { ANTHROPIC_API_KEY } = context.env;

    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ 
          isValid: false, 
          reason: 'Layanan verifikasi AI tidak terkonfigurasi. Silakan gunakan konfirmasi manual via WhatsApp.' 
        }),
        { status: 200, headers }
      );
    }

    const { imageBase64, expectedPrice, expectedBank } = (await context.request.json()) as any;

    if (!imageBase64 || !expectedPrice || !expectedBank) {
      return new Response(
        JSON.stringify({ isValid: false, reason: 'Data tidak lengkap.' }),
        { status: 400, headers }
      );
    }

    // Extract mime type and base64 data from DataURI
    const matches = imageBase64.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return new Response(
        JSON.stringify({ isValid: false, reason: 'Format gambar tidak valid.' }),
        { status: 400, headers }
      );
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    const promptText = `Anda adalah asisten verifikasi keuangan profesional. Periksa bukti transfer bank dalam gambar ini.

Verifikasi hal berikut:
1. Apakah ini bukti transfer bank yang terlihat asli dan valid (bukan gambar tidak relevan, screenshot palsu, atau hasil edit)?
2. Apakah nominal transfer PERSIS Rp ${expectedPrice}?
3. Apakah bank tujuan adalah ${expectedBank}?
4. Apakah status transfer menunjukkan BERHASIL/SUKSES?

Jawab HANYA dengan JSON valid (tanpa markdown, tanpa backticks, tanpa teks lain):
{"isValid": true, "reason": "Penjelasan singkat dalam Bahasa Indonesia"}`;

    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022', // Melakukan override ke model yang stabil dan tersedia saat ini
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType,
                  data: base64Data,
                },
              },
              {
                type: 'text',
                text: promptText,
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error('Anthropic API Error:', errorText);
      return new Response(
        JSON.stringify({ 
          isValid: false, 
          reason: 'Gagal menghubungi layanan verifikasi AI. Coba lagi atau gunakan konfirmasi manual.' 
        }),
        { status: 200, headers }
      );
    }

    const data = (await anthropicResponse.json()) as any;
    const content = data.content?.[0]?.text || '';
    
    // Extract JSON using regex
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(
        JSON.stringify({ 
          isValid: false, 
          reason: 'AI tidak memberikan respon yang valid. Silakan coba lagi.' 
        }),
        { status: 200, headers }
      );
    }

    const result = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify(result), { status: 200, headers });
  } catch (error: any) {
    console.error('Verify Receipt Function Error:', error);
    return new Response(
      JSON.stringify({ 
        isValid: false, 
        reason: 'Terjadi kesalahan sistem saat verifikasi. Silakan gunakan konfirmasi manual.' 
      }),
      { status: 200, headers }
    );
  }
};
