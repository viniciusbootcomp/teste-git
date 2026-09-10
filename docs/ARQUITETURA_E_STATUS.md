# O Box Driver — Arquitetura e Status do Projeto

> Documento vivo do projeto **O Box Driver — Protótipo / Sandbox**. Atualizar a cada bloco relevante concluído.

## 1. Objetivo

Registrar arquitetura, decisões técnicas, regras de negócio, módulos implementados, migrations, segurança, pendências e próximos passos.

Este documento **não é a documentação final de produção**. Ele é a referência viva do protótipo e servirá de base para o futuro aplicativo oficial.

## 2. Classificação do projeto atual

O projeto atual é:

- protótipo funcional;
- sandbox;
- ambiente de demonstração;
- laboratório técnico;
- referência de arquitetura.

Ele **não deve ser convertido diretamente em produção**.

Quando o projeto comercial for iniciado oficialmente, criar ambiente separado com:

- novo repositório;
- novo Supabase;
- novo banco;
- novas credenciais;
- nova aplicação Mercado Pago;
- domínio definitivo;
- dados reais;
- políticas e permissões revisadas;
- monitoramento, logs e backups próprios.

## 3. Stack técnica

Frontend:
- Next.js 16
- React
- TypeScript
- Tailwind CSS

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
- validações críticas devem ocorrer no servidor;
- RLS deve restringir o acesso direto ao banco;
- operações administrativas sensíveis passam por backend seguro;
- pagamentos são confirmados pelo backend/webhook;
- QR Codes usam token seguro;
- operações críticas devem ser auditáveis;
- arquitetura preparada para múltiplas unidades;
- arquitetura preparada para rede/franquia;
- o protótipo deve manter qualidade suficiente para servir como base futura.

## 5. Modelo de negócio

Fluxo principal:

```text
COMPRE → PAGUE → RETIRE → INSTALE
```

O cliente compra pelo aplicativo, paga, recebe confirmação e QR Code, dirige-se à unidade/container, faz check-in no totem e retira a mercadoria.

Na fase inicial não há entrega.

## 6. Pedido comercial e retiradas

Um pedido comercial pode possuir **1 ou N retiradas**.

Exemplo:

```text
Pedido 500
23 silicones

Retirada 1 — Mogi: 20
Retirada 2 — Suzano: 3
```

Regras:

- um pagamento por pedido;
- cada retirada possui unidade própria;
- cada retirada possui QR próprio;
- cada retirada possui estado operacional próprio;
- separação, check-in e entrega acontecem por retirada.

## 7. Estoque e múltiplas unidades

O catálogo deve exibir o estoque total da rede e a distribuição por unidade.

A lógica desejada:

1. tentar atender por uma única unidade;
2. se não for possível, usar o menor número de unidades;
3. futuramente considerar proximidade;
4. permitir confirmação da divisão pelo cliente.

Mesmo com uma unidade no lançamento, a arquitetura permanece preparada para várias.

## 8. Estrutura de rede

```text
Rede
└── Franqueado / Operação
    └── Unidade / Container
        ├── Estoque
        ├── Totem
        └── Retirada
```

Operação própria pode usar:

```text
tipo = propria
```

## 9. Perfis de usuário

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

O perfil `admin` permanece como administrador geral do protótipo.

## 10. Autenticação

Rotas existentes:

```text
/cadastro
/login
/recuperar-senha
/nova-senha
/area-cliente
```

A autenticação utiliza Supabase Auth.

Usuários internos são criados pelo backend com `supabaseAdmin`. A `SUPABASE_SERVICE_ROLE_KEY` nunca deve ser exposta no navegador.

Fluxo de criação interna:

1. administrador cadastra o usuário;
2. backend cria no Supabase Auth;
3. backend cria o perfil em `perfil_cliente`;
4. senha temporária forte é gerada internamente;
5. senha temporária não é devolvida ao navegador;
6. usuário usa o fluxo de recuperação para definir a própria senha.

## 11. Usuários administrativos

Status: **implementado e testado**.

Rotas:

```text
/admin/usuarios
/admin/usuarios/[id]
```

APIs:

```text
/api/admin/usuarios
/api/admin/usuarios/[id]
```

Funcionalidades:

- listar usuários internos;
- buscar por nome, e-mail ou perfil;
- criar usuário;
- editar usuário;
- alterar nome, e-mail e telefone;
- trocar perfil;
- ativar/inativar;
- vincular unidade;
- vincular franqueado/operação;
- mostrar último login;
- impedir auto-inativação;
- impedir remoção acidental do próprio perfil administrativo.

## 12. Produtos

Status: **implementado e testado**.

Rotas:

```text
/admin/produtos
/admin/produtos/novo
/admin/produtos/[id]
/admin/produtos/importar
```

Funcionalidades:

- listagem;
- busca;
- filtro por status;
- cadastro;
- edição;
- código único;
- descrição;
- categoria;
- preço;
- status;
- upload de imagem;
- remoção/substituição de imagem.

## 13. Categorias

Status: **implementado e testado**.

Rotas:

```text
/admin/categorias
/admin/categorias/novo
/admin/categorias/[id]
```

Funcionalidades:

- listar;
- buscar;
- filtrar;
- criar;
- editar;
- ativar/inativar;
- código automático;
- validação de duplicidade.

Tabela:

```text
categorias_produto
```

O produto usa `categoria_id`. O campo legado `categoria` permanece temporariamente por compatibilidade.

## 14. Importação e exportação de produtos

Status: **implementado e testado**.

Tela:

```text
/admin/produtos/importar
```

Opções:

```text
Baixar modelo Excel
Baixar produtos existentes
```

Colunas:

```text
codigo
nome
descricao
categoria
preco
ativo
```

A importação identifica:

- novos;
- existentes;
- erros;
- categoria inválida;
- preço inválido;
- código duplicado;
- status inválido.

Modos:

```text
Ignorar existentes
Atualizar existentes
```

A planilha não altera imagens.

## 15. Pagamentos

Fluxos principais do protótipo já funcionam.

Implementado:

- PIX;
- cartão de crédito;
- Payment Brick;
- webhook;
- confirmação de pagamento;
- integração com pedido.

Arquitetura preparada para débito e refinamentos de reconciliação.

O protótipo deve permanecer em sandbox:

```env
MERCADO_PAGO_ENV=sandbox
```

## 16. QR Code, retirada e totem

Fluxo:

1. pagamento aprovado;
2. retirada liberada;
3. QR Code gerado;
4. cliente chega à unidade;
5. totem lê QR;
6. sistema valida token;
7. retirada entra em check-in;
8. equipe entrega;
9. retirada é concluída.

A arquitetura considera:

- QR por retirada;
- token seguro;
- proteção contra reutilização;
- validação de unidade;
- status operacional;
- ativação segura de totem por HMAC/cookie.

## 17. Segurança

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
- proteção de pagamentos;
- rate limiting;
- logs;
- backups;
- QR seguro;
- proteção contra replay;
- LGPD.

## 18. Banco de dados

Banco:

```text
Supabase / PostgreSQL
```

Projeto:

```text
obox-driver-teste
```

Região:

```text
São Paulo
```

RLS está habilitada nas tabelas relevantes.

## 19. Migrations

Baseline:

```text
20260904_001_base_atual.sql
```

Migrations recentes importantes:

```text
20260909_029_storage_produtos.sql
20260909_030_rls_admin_produtos.sql
20260909_031_codigo_unico_produtos.sql
20260909_032_categorias_produto.sql
20260909_033_usuarios_administrativos.sql
20260909_034_grants_api_admin_usuarios.sql
```

Observação: existem migrations antigas 003, 008 e 011 com nomes fora do padrão. Revisar futuramente.

## 20. Storage

Bucket:

```text
produtos
```

Uso:

- imagens de produtos.

Regras atuais:

- leitura pública;
- gravação administrativa;
- limite de tamanho configurado;
- JPEG / PNG / WEBP.

## 21. Git e versionamento

Branch principal:

```text
main
```

Checkpoint importante:

```text
4ac0016
Implementa produtos categorias e importacao em massa
```

Fluxo recomendado:

```text
concluir bloco
→ testar
→ aplicar migration
→ validar
→ commit
→ push
→ atualizar documentação
```

## 22. Fluxos já validados

Produtos:
- cadastro;
- edição;
- imagem;
- categoria;
- exportação;
- importação;
- atualização em massa.

Usuários:
- criação;
- listagem;
- edição;
- alteração de e-mail;
- perfis;
- status;
- vínculo de unidade;
- vínculo de franqueado/operação.

Pagamentos:
- PIX;
- crédito;
- webhook.

Operação:
- separação;
- check-in;
- entrega;
- retirada.

## 23. Próximos módulos

Fila funcional atual:

1. notificações internas;
2. espaços de marketing/parceiros;
3. refinamento de permissões por perfil;
4. gestão administrativa de unidades/franqueados;
5. PWA;
6. melhorias operacionais.

## 24. Pendências técnicas

- expiração automática de reservas;
- scheduler de reservas;
- reconciliação genérica de pagamentos;
- condição de corrida pagamento aprovado × reserva expirada;
- atomicidade financeira;
- rate limiting;
- hardening server-side das áreas administrativas;
- testes multiusuário;
- proteção contra replay de QR;
- validação de QR por unidade;
- PWA;
- deploy estável de demonstração;
- testes automatizados;
- README técnico;
- logs estruturados;
- backups;
- refinamentos de webhook;
- LGPD de produção;
- 3DS e regras adicionais de cartão no app oficial.

## 25. Aplicação oficial futura

Ao iniciar produção, criar do zero a infraestrutura oficial:

- novo Supabase;
- novo banco;
- novo app Mercado Pago;
- novas credenciais;
- novo domínio;
- políticas de RLS revisadas;
- auditoria;
- logs;
- backups;
- monitoramento;
- rate limiting;
- política de secrets;
- testes automatizados;
- estratégia de recuperação.

## 26. Convenções

Toda mudança estrutural de banco deve possuir migration.

```text
1. criar migration
2. salvar em supabase/migrations
3. executar no SQL Editor
4. validar
5. versionar no Git
```

Backend sensível:

```text
src/app/api/
```

Frontend administrativo:

```text
src/app/admin/
```

Nunca expor no client:

- `SUPABASE_SERVICE_ROLE_KEY`;
- tokens privados;
- credenciais privadas do Mercado Pago.

## 27. Regra para manutenção deste documento

Ao concluir um módulo:

1. atualizar o status;
2. registrar novas rotas;
3. registrar novas APIs;
4. registrar migrations;
5. registrar decisões de arquitetura;
6. registrar pendências;
7. registrar commit importante.

## 28. Estado atual resumido

Concluído:

- autenticação base;
- catálogo;
- estoque;
- carrinho;
- reservas;
- pedido;
- retiradas;
- PIX;
- crédito;
- webhook;
- totem/QR;
- separação;
- check-in;
- entrega;
- produtos;
- categorias;
- imagens;
- Excel;
- usuários administrativos;
- arquitetura multiunidade;
- arquitetura para franquia.

Próximo:

- notificações internas;
- permissões por perfil;
- gestão operacional;
- marketing/parceiros;
- documentação contínua.

---

**Última atualização:** setembro de 2026
