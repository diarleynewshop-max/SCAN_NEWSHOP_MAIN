import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Apenas método POST permitido
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { task, payload } = req.body;
    
    // Validar inputs
    if (!task || !payload) {
      return res.status(400).json({ error: 'Missing task or payload' });
    }

    // Chamar Trigger.dev API server-side (sem CORS)
    const response = await fetch('https://api.trigger.dev/v1/runs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.VITE_TRIGGER_API_KEY}`,
      },
      body: JSON.stringify({ task, payload }),
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('Trigger.dev API error:', result);
      return res.status(response.status).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
