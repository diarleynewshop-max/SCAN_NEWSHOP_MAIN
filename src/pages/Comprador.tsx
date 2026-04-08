import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ShoppingCart, Package, AlertTriangle, CheckCircle, XCircle, Filter, Download, RefreshCw, Eye } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const Comprador = () => {
  const navigate = useNavigate();
  const { loginSalvo } = useAuth();
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");

  // Dados mockados para itens sem estoque (serão substituídos por dados do Supabase)
  const itensSemEstoque = [
    { 
      id: 1, 
      codigo: "PROD001", 
      descricao: "Smartphone Galaxy S24", 
      quantidadePedida: 50, 
      quantidadeConferida: 0, 
      status: "nao_tem", 
      conferenciaId: "CONF20250408-001",
      dataConferencia: "08/04/2025 14:30",
      setor: "Eletrônicos",
      motivo: "Produto esgotado no fornecedor"
    },
    { 
      id: 2, 
      codigo: "PROD002", 
      descricao: "Fone Bluetooth Premium", 
      quantidadePedida: 100, 
      quantidadeConferida: 25, 
      status: "nao_tem_tudo", 
      conferenciaId: "CONF20250408-002",
      dataConferencia: "08/04/2025 15:15",
      setor: "Acessórios",
      motivo: "Fornecedor com entrega parcial"
    },
    { 
      id: 3, 
      codigo: "PROD003", 
      descricao: "Carregador Rápido 65W", 
      quantidadePedida: 80, 
      quantidadeConferida: 0, 
      status: "nao_tem", 
      conferenciaId: "CONF20250408-003",
      dataConferencia: "07/04/2025 10:45",
      setor: "Eletrônicos",
      motivo: "Aguardando nova remessa"
    },
    { 
      id: 4, 
      codigo: "PROD004", 
      descricao: "Capa Protetora Anti-Impacto", 
      quantidadePedida: 150, 
      quantidadeConferida: 90, 
      status: "nao_tem_tudo", 
      conferenciaId: "CONF20250407-001",
      dataConferencia: "07/04/2025 16:20",
      setor: "Acessórios",
      motivo: "Produção atrasada"
    },
    { 
      id: 5, 
      codigo: "PROD005", 
      descricao: "Tablet Pro 12.9\"", 
      quantidadePedida: 30, 
      quantidadeConferida: 0, 
      status: "nao_tem", 
      conferenciaId: "CONF20250406-001",
      dataConferencia: "06/04/2025 09:15",
      setor: "Eletrônicos",
      motivo: "Problema de fabricação"
    },
    { 
      id: 6, 
      codigo: "PROD006", 
      descricao: "Power Bank 20000mAh", 
      quantidadePedida: 120, 
      quantidadeConferida: 45, 
      status: "nao_tem_tudo", 
      conferenciaId: "CONF20250406-002",
      dataConferencia: "06/04/2025 11:30",
      setor: "Eletrônicos",
      motivo: "Demanda maior que o esperado"
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "nao_tem":
        return (
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 10px",
            borderRadius: 12,
            background: "hsl(var(--destructive) / 0.1)",
            color: "hsl(var(--destructive))",
            fontSize: 12,
            fontWeight: 600,
          }}>
            <XCircle size={12} /> Sem Estoque
          </span>
        );
      case "nao_tem_tudo":
        return (
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 10px",
            borderRadius: 12,
            background: "hsl(var(--warning) / 0.1)",
            color: "hsl(var(--warning))",
            fontSize: 12,
            fontWeight: 600,
          }}>
            <AlertTriangle size={12} /> Estoque Parcial
          </span>
        );
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "nao_tem": return "hsl(var(--destructive))";
      case "nao_tem_tudo": return "hsl(var(--warning))";
      default: return "hsl(var(--muted-foreground))";
    }
  };

  const filteredItens = itensSemEstoque.filter(item => {
    if (filtroStatus === "todos") return true;
    return item.status === filtroStatus;
  });

  const stats = {
    total: itensSemEstoque.length,
    semEstoque: itensSemEstoque.filter(item => item.status === "nao_tem").length,
    parcial: itensSemEstoque.filter(item => item.status === "nao_tem_tudo").length,
    totalPedido: itensSemEstoque.reduce((sum, item) => sum + item.quantidadePedida, 0),
    totalFaltante: itensSemEstoque.reduce((sum, item) => sum + (item.quantidadePedida - item.quantidadeConferida), 0),
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "hsl(var(--background))",
      color: "hsl(var(--foreground))",
      padding: "16px",
    }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        
        {/* Header */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          marginBottom: "24px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              onClick={() => navigate("/")}
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "hsl(var(--secondary))",
                border: "1px solid hsl(var(--border))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 style={{
                fontSize: "28px",
                fontWeight: 700,
                fontFamily: "var(--font-serif)",
                color: "hsl(var(--foreground))",
                margin: 0,
              }}>
                COMPRADOR
              </h1>
              <p style={{
                fontSize: "14px",
                color: "hsl(var(--muted-foreground))",
                margin: "4px 0 0 0",
              }}>
                Itens sem estoque identificados nas conferências
              </p>
            </div>
          </div>

          {/* Stats Cards */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
            marginBottom: "16px",
          }}>
            <div style={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "12px",
              padding: "20px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                <div style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "hsl(var(--primary) / 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <ShoppingCart size={20} color="hsl(var(--primary))" />
                </div>
                <div>
                  <p style={{ fontSize: "14px", color: "hsl(var(--muted-foreground))", margin: 0 }}>Total de Itens</p>
                  <p style={{ fontSize: "24px", fontWeight: 700, color: "hsl(var(--foreground))", margin: "4px 0 0 0" }}>
                    {stats.total}
                  </p>
                </div>
              </div>
            </div>

            <div style={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "12px",
              padding: "20px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                <div style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "hsl(var(--destructive) / 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <XCircle size={20} color="hsl(var(--destructive))" />
                </div>
                <div>
                  <p style={{ fontSize: "14px", color: "hsl(var(--muted-foreground))", margin: 0 }}>Sem Estoque</p>
                  <p style={{ fontSize: "24px", fontWeight: 700, color: "hsl(var(--destructive))", margin: "4px 0 0 0" }}>
                    {stats.semEstoque}
                  </p>
                </div>
              </div>
            </div>

            <div style={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "12px",
              padding: "20px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                <div style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "hsl(var(--warning) / 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <AlertTriangle size={20} color="hsl(var(--warning))" />
                </div>
                <div>
                  <p style={{ fontSize: "14px", color: "hsl(var(--muted-foreground))", margin: 0 }}>Estoque Parcial</p>
                  <p style={{ fontSize: "24px", fontWeight: 700, color: "hsl(var(--warning))", margin: "4px 0 0 0" }}>
                    {stats.parcial}
                  </p>
                </div>
              </div>
            </div>

            <div style={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "12px",
              padding: "20px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                <div style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "hsl(var(--success) / 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <Package size={20} color="hsl(var(--success))" />
                </div>
                <div>
                  <p style={{ fontSize: "14px", color: "hsl(var(--muted-foreground))", margin: 0 }}>Faltam</p>
                  <p style={{ fontSize: "24px", fontWeight: 700, color: "hsl(var(--foreground))", margin: "4px 0 0 0" }}>
                    {stats.totalFaltante} unidades
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Filtros e Ações */}
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "20px",
          }}>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                onClick={() => setFiltroStatus("todos")}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  background: filtroStatus === "todos" ? "hsl(var(--primary))" : "hsl(var(--secondary))",
                  color: filtroStatus === "todos" ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))",
                  border: "none",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Todos ({stats.total})
              </button>
              <button
                onClick={() => setFiltroStatus("nao_tem")}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  background: filtroStatus === "nao_tem" ? "hsl(var(--destructive))" : "hsl(var(--secondary))",
                  color: filtroStatus === "nao_tem" ? "white" : "hsl(var(--foreground))",
                  border: "none",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Sem Estoque ({stats.semEstoque})
              </button>
              <button
                onClick={() => setFiltroStatus("nao_tem_tudo")}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  background: filtroStatus === "nao_tem_tudo" ? "hsl(var(--warning))" : "hsl(var(--secondary))",
                  color: filtroStatus === "nao_tem_tudo" ? "white" : "hsl(var(--foreground))",
                  border: "none",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Parcial ({stats.parcial})
              </button>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                style={{
                  padding: "10px 16px",
                  borderRadius: "8px",
                  background: "hsl(var(--secondary))",
                  border: "1px solid hsl(var(--border))",
                  color: "hsl(var(--foreground))",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <Filter size={16} /> Filtrar
              </button>
              <button
                style={{
                  padding: "10px 16px",
                  borderRadius: "8px",
                  background: "hsl(var(--secondary))",
                  border: "1px solid hsl(var(--border))",
                  color: "hsl(var(--foreground))",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <Download size={16} /> Exportar
              </button>
              <button
                style={{
                  padding: "10px 16px",
                  borderRadius: "8px",
                  background: "hsl(var(--primary))",
                  border: "none",
                  color: "hsl(var(--primary-foreground))",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <RefreshCw size={16} /> Atualizar
              </button>
            </div>
          </div>
        </div>

        {/* Tabela de Itens */}
        <div style={{
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          borderRadius: "12px",
          overflow: "hidden",
        }}>
          <div style={{
            padding: "20px",
            borderBottom: "1px solid hsl(var(--border))",
            background: "hsl(var(--secondary))",
          }}>
            <h2 style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "hsl(var(--foreground))",
              margin: 0,
            }}>
              Itens para Reposição
            </h2>
            <p style={{
              fontSize: "13px",
              color: "hsl(var(--muted-foreground))",
              margin: "4px 0 0 0",
            }}>
              Lista de produtos identificados como sem estoque nas conferências
            </p>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{
              width: "100%",
              borderCollapse: "collapse",
            }}>
              <thead>
                <tr style={{
                  background: "hsl(var(--secondary))",
                  borderBottom: "1px solid hsl(var(--border))",
                }}>
                  <th style={{ padding: "16px", textAlign: "left", fontSize: "13px", fontWeight: 600, color: "hsl(var(--muted-foreground))" }}>Código</th>
                  <th style={{ padding: "16px", textAlign: "left", fontSize: "13px", fontWeight: 600, color: "hsl(var(--muted-foreground))" }}>Descrição</th>
                  <th style={{ padding: "16px", textAlign: "left", fontSize: "13px", fontWeight: 600, color: "hsl(var(--muted-foreground))" }}>Quantidade</th>
                  <th style={{ padding: "16px", textAlign: "left", fontSize: "13px", fontWeight: 600, color: "hsl(var(--muted-foreground))" }}>Status</th>
                  <th style={{ padding: "16px", textAlign: "left", fontSize: "13px", fontWeight: 600, color: "hsl(var(--muted-foreground))" }}>Conferência</th>
                  <th style={{ padding: "16px", textAlign: "left", fontSize: "13px", fontWeight: 600, color: "hsl(var(--muted-foreground))" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredItens.map((item) => (
                  <tr key={item.id} style={{
                    borderBottom: "1px solid hsl(var(--border))",
                    transition: "background 0.2s",
                  }}>
                    <td style={{ padding: "16px", fontSize: "14px", fontWeight: 600, color: "hsl(var(--foreground))" }}>
                      {item.codigo}
                    </td>
                    <td style={{ padding: "16px" }}>
                      <div>
                        <p style={{ fontSize: "14px", fontWeight: 600, color: "hsl(var(--foreground))", margin: "0 0 4px 0" }}>
                          {item.descricao}
                        </p>
                        <p style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))", margin: 0 }}>
                          {item.setor} • {item.motivo}
                        </p>
                      </div>
                    </td>
                    <td style={{ padding: "16px" }}>
                      <div>
                        <p style={{ fontSize: "14px", fontWeight: 600, color: "hsl(var(--foreground))", margin: "0 0 4px 0" }}>
                          Pedido: {item.quantidadePedida} | Conferido: {item.quantidadeConferida}
                        </p>
                        <p style={{ 
                          fontSize: "13px", 
                          fontWeight: 600, 
                          color: getStatusColor(item.status),
                          margin: 0,
                        }}>
                          Faltam: {item.quantidadePedida - item.quantidadeConferida} unidades
                        </p>
                      </div>
                    </td>
                    <td style={{ padding: "16px" }}>
                      {getStatusBadge(item.status)}
                    </td>
                    <td style={{ padding: "16px" }}>
                      <div>
                        <p style={{ fontSize: "13px", fontWeight: 600, color: "hsl(var(--foreground))", margin: "0 0 4px 0" }}>
                          {item.conferenciaId}
                        </p>
                        <p style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))", margin: 0 }}>
                          {item.dataConferencia}
                        </p>
                      </div>
                    </td>
                    <td style={{ padding: "16px" }}>
                      <button
                        style={{
                          padding: "8px 12px",
                          borderRadius: "8px",
                          background: "hsl(var(--primary) / 0.1)",
                          border: "1px solid hsl(var(--primary) / 0.3)",
                          color: "hsl(var(--primary))",
                          fontSize: "13px",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <Eye size={14} /> Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredItens.length === 0 && (
            <div style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "hsl(var(--muted-foreground))",
            }}>
              <CheckCircle size={48} style={{ margin: "0 auto 16px", opacity: 0.5 }} />
              <p style={{ fontSize: "16px", fontWeight: 600, margin: "0 0 8px 0" }}>
                Nenhum item encontrado
              </p>
              <p style={{ fontSize: "14px", margin: 0 }}>
                {filtroStatus === "todos" 
                  ? "Todos os itens estão com estoque completo!" 
                  : `Nenhum item com status "${filtroStatus}" encontrado.`}
              </p>
            </div>
          )}

          <div style={{
            padding: "16px 20px",
            borderTop: "1px solid hsl(var(--border))",
            background: "hsl(var(--secondary))",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <p style={{ fontSize: "13px", color: "hsl(var(--muted-foreground))", margin: 0 }}>
              Mostrando {filteredItens.length} de {itensSemEstoque.length} itens
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                style={{
                  padding: "8px 12px",
                  borderRadius: "6px",
                  background: "hsl(var(--secondary))",
                  border: "1px solid hsl(var(--border))",
                  color: "hsl(var(--foreground))",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Anterior
              </button>
              <button
                style={{
                  padding: "8px 12px",
                  borderRadius: "6px",
                  background: "hsl(var(--primary))",
                  border: "none",
                  color: "hsl(var(--primary-foreground))",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Próxima
              </button>
            </div>
          </div>
        </div>

        {/* Nota Informativa */}
        <div style={{
          marginTop: "20px",
          padding: "16px",
          background: "hsl(var(--secondary))",
          border: "1px solid hsl(var(--border))",
          borderRadius: "12px",
        }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <AlertTriangle size={20} color="hsl(var(--warning))" />
            <div>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "hsl(var(--foreground))", margin: "0 0 8px 0" }}>
                Como funciona esta lista?
              </p>
              <p style={{ fontSize: "13px", color: "hsl(var(--muted-foreground))", margin: 0, lineHeight: 1.5 }}>
                Esta página mostra automaticamente os itens que foram marcados como "não tem" ou "não tem tudo" 
                durante as conferências de estoque. Os dados são atualizados em tempo real conforme novas 
                conferências são realizadas. Use esta lista para priorizar as compras de reposição.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Comprador;