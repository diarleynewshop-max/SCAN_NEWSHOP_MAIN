import type { NextApiRequest, NextApiResponse } from 'next';

type Data = {
  success: boolean;
  data?: any;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  try {
    const { action, taskId, fileId, listId } = req.query;
    
    // Validar parâmetros obrigatórios
    if (!action) {
      return res.status(400).json({ 
        success: false, 
        error: 'Parâmetro "action" é obrigatório' 
      });
    }

    const CLICKUP_TOKEN = process.env.CLICKUP_TOKEN || process.env.CLICKUP_TOKEN_SF;
    
    if (!CLICKUP_TOKEN) {
      return res.status(500).json({ 
        success: false, 
        error: 'Token do ClickUp não configurado' 
      });
    }

    // Headers padrão para ClickUp
    const headers = {
      'Authorization': CLICKUP_TOKEN,
      'Content-Type': 'application/json',
    };

    let response;
    let data;

    switch (action) {
      // Buscar tasks
      case 'buscar-tasks':
        const listIdToUse = listId || '901325900510'; // Default NEWSHOP
        response = await fetch(
          `https://api.clickup.com/api/v2/list/${listIdToUse}/task?subtasks=true`,
          { headers }
        );
        data = await response.json();
        return res.status(200).json({ success: true, data });

      // Baixar JSON do attachment
      case 'baixar-json':
        if (!taskId || !fileId) {
          return res.status(400).json({ 
            success: false, 
            error: 'taskId e fileId são obrigatórios para baixar-json' 
          });
        }
        
        // Aqui você pode fazer uma chamada direta ou usar a API do ClickUp
        // Para attachments, muitas vezes é melhor fazer via proxy
        const attachmentUrl = `https://api.clickup.com/api/v2/task/${taskId}/attachment/${fileId}`;
        response = await fetch(attachmentUrl, { headers });
        
        if (!response.ok) {
          return res.status(response.status).json({ 
            success: false, 
            error: `Erro ao buscar attachment: ${response.statusText}` 
          });
        }
        
        data = await response.json();
        return res.status(200).json({ success: true, data });

      // Deletar task
      case 'deletar-task':
        if (!taskId) {
          return res.status(400).json({ 
            success: false, 
            error: 'taskId é obrigatório para deletar-task' 
          });
        }
        
        response = await fetch(
          `https://api.clickup.com/api/v2/task/${taskId}`,
          { 
            method: 'DELETE',
            headers 
          }
        );
        
        if (response.status === 204) {
          return res.status(200).json({ 
            success: true, 
            data: { message: 'Task deletada com sucesso' } 
          });
        } else {
          const errorData = await response.json();
          return res.status(response.status).json({ 
            success: false, 
            error: errorData.err || 'Erro ao deletar task' 
          });
        }

      default:
        return res.status(400).json({ 
          success: false, 
          error: 'Action não reconhecida' 
        });
    }

  } catch (error: any) {
    console.error('Erro no clickup-proxy:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Erro interno do servidor' 
    });
  }
}
