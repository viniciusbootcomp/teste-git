# O Box Driver — Arquitetura e Status do Projeto

> Documento vivo do projeto **O Box Driver — Fase 1 / Homologação**.
> Atualizar ao concluir blocos relevantes, antes dos respectivos checkpoints de Git.

## 1. Objetivo

Registrar arquitetura, decisões técnicas, regras de negócio, módulos implementados,
migrations, segurança, pendências e próximos passos.

A Fase 1 tem dois objetivos simultâneos:

1. validar na prática se o modelo de negócio funciona;
2. construir uma fundação técnica que possa evoluir sem reconstrução caso o produto escale.

Princípio central:

> **Simples no uso, preparada no núcleo.**

Não devem ser construídos antecipadamente módulos de franquia, royalties, gestão regional,
repasse financeiro ou outras estruturas que ainda não fazem parte da operação real.
Entretanto, decisões de baixo custo agora devem evitar amarrações que impeçam futura
expansão para múltiplas unidades e franquias.

## 2. Classificação do ambiente atual

O projeto atual é o **ambiente oficial de homologação da Fase 1**.

Uso:

- desenvolvimento local;
- testes;
- demonstrações;
- validação com o idealizador;
- validação operacional;
- referência de arquitetura;
- preparação para produção.

Este ambiente **não deve ser convertido diretamente em produção**.

Fluxo alvo:

```text
desenvolvimento local
→ homologação estável
→ produção limpa
```

Produção futura deverá possuir, no mínimo:

- ambiente separado;
- Supabase separado;
- banco limpo;
- credenciais próprias;
- aplicação Mercado Pago de produção;
- domínio definitivo;
- usuários reais;
- políticas revisadas;
- logs;
- backups;
- monitoramento;
- rate limiting;
- política de secrets.

## 3. Stack técnica

Frontend:

- Next.js 16.3.4
- React
- TypeScript
- Tailwind CSS
- lucide-react

Backend:

- Next.js Route Handlers
- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Storage

Integrações:

- Mercado Pago
- qrcode.react
- html5-qrcode
- xlsx
- Git / GitHub
- Vercel

Projeto local:

```text
C:\Projetos\teste-next
```

Repositório:

```text
https://github.com/viniciusbootcomp/teste-git.git
```

## 4. Princípios de arquitetura

- navegador nunca é fonte confiável para preço, estoque, status ou pagamento;
- segredos ficam somente no backend;
- validações críticas devem ocorrer no servidor/banco;
- RLS restringe acesso direto ao banco;
- operações administrativas sensíveis devem ser protegidas server-side;
- pagamentos são confirmados pelo backend/webhook;
- QR Codes usam token seguro;
- operações críticas devem ser auditáveis;
- arquitetura preparada para múltiplas unidades;
- arquitetura preparada para evolução para rede/franquia;
- não antecipar módulos de expansão sem necessidade real;
- mudanças estruturais de banco sempre possuem migration;
- decisões arquiteturais relevantes devem possuir ADR;
- o ambiente de homologação deve manter qualidade de engenharia compatível com futura produção.

## 5. Fluxo principal de negócio

```text
COMPRE → PAGUE → RETIRE → INSTALE
```

O cliente:

1. acessa o catálogo;
2. adiciona produtos;
3. reserva estoque;
4. realiza pagamento;
5. acompanha o pedido;
6. recebe liberação para retirada;
7. apresenta QR/check-in;
8. retira os materiais.

Na Fase 1 não há entrega ao endereço do cliente.

## 6. Pedido comercial e retiradas

Um pedido comercial pode possuir **1 ou N retiradas**.

Regras:

- um pagamento por pedido comercial;
- cada retirada pertence a uma unidade;
- cada retirada possui estado operacional próprio;
- separação acontece por retirada;
- check-in acontece por retirada;
- entrega física acontece por retirada;
- arquitetura permite futura divisão entre unidades.

Fluxo operacional validado:

```text
compra
→ pagamento aprovado
→ recebido
→ em separação
→ pronto para retirada
→ cliente no local
→ entregue
```

## 7. Estoque e unidades

O catálogo exibe disponibilidade da rede.

Prioridade da futura distribuição:

1. atender por uma única unidade;
2. se impossível, usar o menor número de unidades;
3. futuramente considerar proximidade;
4. permitir confirmação da divisão pelo cliente quando necessário.

A Fase 1 inicia com operação enxuta, mas estoque e retirada permanecem associados a unidade.

## 8. Estrutura de expansão

Modelo conceitual:

```text
Rede
└── Operação / Franqueado
    └── Unidade / Container
        ├── Estoque
        ├── Totem
        └── Retiradas
```

A existência dessa estrutura não significa que todos os módulos de franquia serão
implementados na Fase 1.

## 9. Usuários, perfis e capacidades

Perfis previstos:

```text
cliente
admin
admin_rede
franqueado
gestor_unidade
separacao
retirada
```

A partir da migration 042, capacidades operacionais podem ser acumuladas.

Tabela:

```text
usuario_permissoes
```

Exemplo:

```text
Henrique
perfil principal: separacao

capacidades:
- separacao
- retirada
```

Isso permite operação enxuta, em que a mesma pessoa pode separar e entregar materiais.

Função central criada:

```sql
public.usuario_atual_tem_permissao(text)
```

O campo `perfil_cliente.tipo_usuario` permanece como perfil principal e compatibilidade
durante a transição.

## 10. Autenticação e destino pós-login

Rotas:

```text
/cadastro
/login
/recuperar-senha
/nova-senha
/area-cliente
```

O redirecionamento pós-login foi centralizado em:

```text
src/lib/auth/destino-pos-login.ts
```

Regra atual:

```text
cliente → /
admin/admin_rede → /admin/pedidos
separacao → /admin/pedidos
retirada → /admin/retirada/fila
separacao + retirada → /admin/pedidos
```

O catálogo (`/`) é a tela inicial do cliente.

## 11. Experiência do cliente

Status: **funcional para a Fase 1 atual**.

Fluxos já disponíveis:

- login;
- catálogo;
- busca de produtos;
- acesso à Área do Cliente;
- carrinho;
- checkout;
- pagamento;
- confirmação de pedido;
- acompanhamento de pedido;
- QR quando a retirada está pronta;
- notificações;
- retorno da Área do Cliente para o catálogo.

Cabeçalho do catálogo:

```text
perfil | busca | notificações
```

O bloco de perfil está preparado para futura foto do usuário.

## 12. Pagamentos

Implementado:

- PIX;
- cartão de crédito;
- Payment Brick;
- webhook;
- reconciliação PIX;
- criação de pedido após aprovação;
- proteção contra processamento concorrente em pontos já tratados.

Homologação deve permanecer em sandbox:

```env
MERCADO_PAGO_ENV=sandbox
```

Build de produção exigiu uso correto de `Suspense` nas rotas que utilizam
`useSearchParams()`:

```text
/pagamento
/pedido-sucesso
```

## 13. Operação — separação

Perfil/capacidade `separacao` já consegue:

- acessar pedidos compatíveis;
- abrir retirada;
- iniciar separação;
- ler/conferir produtos;
- concluir a separação;
- alterar retirada para `pronto_retirada`.

RPCs ajustadas para permitir `admin` e separação:

```text
iniciar_separacao_retirada
registrar_leitura_separacao_retirada
```

A entrega física continua separada da permissão de separação.

## 14. Operação — retirada

Fluxo existente:

```text
cliente faz check-in
→ retirada entra na fila
→ painel operacional atualiza
→ equipe atende
→ entrega é confirmada
```

Tela principal:

```text
/admin/retirada/fila
```

Próximo bloco administrativo deve concluir o uso real da capacidade `retirada`,
inclusive para usuários que também possuem `separacao`.

## 15. Notificações

Arquitetura atual:

- notificações do cliente para eventos relevantes;
- operação interna orientada por painéis;
- notificações internas reservadas para exceções e alertas relevantes.

Leitura individual:

```text
notificacoes
notificacoes_leitura
```

A leitura é por usuário. Uma notificação de perfil/unidade não se torna lida para todos
quando apenas uma pessoa a abre.

Evento validado de ponta a ponta:

```text
retirada pronta
→ notificação individual para o cliente
→ sino mostra não lida
→ clique direciona ao pedido
```

A notificação automática:

```text
pedido pago → separacao
```

foi implementada e validada tecnicamente, mas a decisão atual é **não usar eventos
operacionais normais como notificação interna padrão**, pois o painel é a fonte de trabalho.
Esse trigger deve ser desativado/ajustado em bloco futuro documentado.

## 16. Segurança

Requisitos permanentes:

- HTTPS;
- autenticação segura;
- RLS;
- secrets somente no backend;
- validação server-side;
- validação de webhooks;
- proteção contra manipulação de preço;
- proteção contra manipulação de estoque;
- proteção contra manipulação de status;
- proteção financeira;
- rate limiting;
- logs;
- backups;
- QR seguro;
- proteção contra replay;
- validação de unidade;
- LGPD.

RLS do perfil `separacao` utiliza funções `SECURITY DEFINER` para evitar recursão entre
policies relacionadas a pedidos e retiradas.

## 17. Banco e migrations recentes

Baseline:

```text
20260904_001_base_atual.sql
```

Migrations relevantes deste marco:

```text
20260914_037_notificacoes_leitura_individual.sql
20260914_038_notificacao_retirada_pronta_cliente.sql
20260914_039_permissoes_perfil_separacao.sql
20260914_040_rls_leitura_perfil_separacao.sql
20260914_041_corrige_recursao_rls_separacao.sql
20260914_042_permissoes_operacionais_multiplas.sql
```

Observação:

- a migration 040 foi aplicada;
- a migration 041 corrige a recursão introduzida pelas policies da 040;
- ambas permanecem versionadas para reproduzir corretamente a evolução do banco.

## 18. Build e qualidade

Em 14/09/2026 o projeto foi validado com:

```powershell
npm run build
```

Resultado:

```text
Compiled successfully
Finished TypeScript
Generated static pages 45/45
Finalized page optimization
```

Build de produção: **aprovado**.

Também foi executado:

```powershell
git diff --check
```

sem erros relevantes de whitespace.

## 19. Git e checkpoints

Branch principal:

```text
main
```

Checkpoint anterior:

```text
5278504
Marco homologacao inicial apos aprovacao do cliente
```

Tag:

```text
homologacao-inicial-fase1
```

O checkpoint deste documento deve registrar:

- leitura individual de notificações;
- notificação de retirada pronta;
- permissões de separação;
- permissões operacionais múltiplas;
- navegação pós-login;
- melhorias da experiência do cliente;
- correções de build do Next.js.

## 20. ADRs

Diretório:

```text
docs/adr/
```

ADRs atuais:

```text
ADR-001-fase1-simples-no-uso-preparada-no-nucleo.md
ADR-002-pedido-comercial-com-multiplas-retiradas.md
ADR-003-permissoes-operacionais-acumulaveis.md
ADR-004-painel-operacional-como-fonte-de-trabalho.md
ADR-005-separacao-homologacao-producao.md
```

## 21. Pendências prioritárias

Antes de ampliar funcionalidades, priorizar:

1. concluir capacidade `retirada` e acesso por permissões acumuláveis;
2. revisar/remover notificação operacional padrão `pedido pago → separacao`;
3. testar fluxo completo com contas distintas:
   `cliente → separacao → retirada`;
4. criar notificação `retirada concluída → cliente`;
5. expiração automática de reservas;
6. condição de corrida pagamento aprovado × reserva expirada;
7. rate limiting;
8. hardening server-side administrativo;
9. proteção contra replay de QR;
10. validação de QR por unidade;
11. logs estruturados;
12. backups;
13. testes automatizados;
14. deploy estável de homologação.

## 22. Itens que não devem ser antecipados

Não implementar na Fase 1 sem necessidade real:

- royalties;
- repasse entre franqueado e franqueadora;
- portal de franquias completo;
- gestão regional complexa;
- dezenas de níveis hierárquicos;
- regras comerciais por estado;
- BI nacional;
- infraestrutura distribuída prematuramente.

Preparar estrutura quando barato; implementar módulo apenas quando houver necessidade real.

## 23. Convenção de desenvolvimento

Ciclo obrigatório por bloco:

```text
regra de negócio
→ arquitetura
→ segurança
→ impacto em escala
→ implementação
→ teste técnico
→ teste funcional
→ documentação
→ commit
```

Banco:

```text
1. criar migration
2. salvar em supabase/migrations
3. executar no SQL Editor
4. validar
5. versionar no Git
```

Toda decisão arquitetural relevante deve ser registrada em ADR.

## 24. Estado atual resumido

Concluído/validado:

- autenticação;
- catálogo;
- busca;
- carrinho;
- reservas;
- pedido;
- múltiplas retiradas;
- PIX;
- crédito;
- webhook;
- QR/totem;
- separação;
- check-in;
- entrega;
- produtos;
- categorias;
- imagens;
- Excel;
- usuários administrativos;
- notificações individuais;
- retirada pronta → cliente;
- perfil `separacao`;
- permissões operacionais múltiplas;
- login com destino por perfil;
- experiência principal do cliente;
- build de produção aprovado.

Próximo foco:

```text
administração e operação interna
→ capacidades separacao/retirada
→ fluxo completo por perfis reais
→ fechamento técnico da homologação Fase 1
```

---

**Última atualização:** 14/09/2026
