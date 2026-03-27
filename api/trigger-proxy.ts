// pages/api/trigger-proxy.ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('🔄 Trigger Proxy chamado:', req.method, req.body);
  
  // Apenas método POST permitido
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { task, payload } = req.body;
    
    // Validar inputs
    if (!task || !payload) {
      console.error('❌ Missing task or payload:', { task, payload });
      return res.status(400).json({ error: 'Missing task or payload' });
    }

    // Verificar se API key existe
    const apiKey = process.env.VITE_TRIGGER_API_KEY;
    if (!apiKey) {
      console.error('❌ VITE_TRIGGER_API_KEY não encontrada nas envs');
      return res.status(500).json({ error: 'API key not configured' });
    }

    console.log(`📤 Chamando Trigger.dev API para task: ${task}`);
    
    // Chamar Trigger.dev API server-side (sem CORS)
    const response = await fetch('https://api.trigger.dev/v1/runs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ task, payload }),
    });

    const responseBody = await response.text();
    console.log(`📥 Resposta do Trigger.dev: ${response.status}`, responseBody.substring(0, 200));

    if (!response.ok) {
      console.error('❌ Trigger.dev API error:', responseBody);
      return res.status(response.status).json({ 
        error: 'Trigger.dev API error', 
        details: responseBody 
      });
    }

    const result = JSON.parse(responseBody);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('💥 Proxy error:', error);
    console.error('📝 Error details:', error.message, error.stack);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
}
