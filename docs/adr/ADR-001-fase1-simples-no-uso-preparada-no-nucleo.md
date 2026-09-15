# ADR-001 — Fase 1 simples no uso, preparada no núcleo

**Status:** Aceito  
**Data:** 14/09/2026

## Contexto

Existe ambição de expansão nacional e possível franquia em 2–3 anos, mas a Fase 1 precisa
primeiro validar se o modelo funciona na operação real.

Construir agora toda a infraestrutura de uma rede nacional geraria custo, complexidade e
risco de desenvolver funcionalidades sem uso.

Por outro lado, amarrar o sistema a uma única unidade ou operação poderia obrigar uma
reconstrução futura.

## Decisão

Adotar o princípio:

> **Simples no uso, preparada no núcleo.**

A Fase 1 implementará apenas recursos necessários à validação real da operação, mas
entidades e relações estruturais serão modeladas para permitir evolução.

Preparar desde já quando o custo for baixo:

- unidade;
- estoque por unidade;
- retirada por unidade;
- pedido separado de retirada;
- permissões acumuláveis;
- IDs independentes;
- backend confiável;
- migrations;
- auditoria futura.

Não antecipar módulos sem necessidade real:

- royalties;
- repasses;
- gestão regional complexa;
- portal completo de franquias;
- regras comerciais nacionais.

## Consequências

Positivas:

- menor retrabalho caso a expansão ocorra;
- menor complexidade na Fase 1;
- foco na validação do negócio;
- evolução incremental.

Negativas:

- algumas estruturas existirão antes de serem usadas em escala;
- será necessário revisar decisões quando dados reais de operação estiverem disponíveis.
