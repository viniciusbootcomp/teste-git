# ADR-002 — Pedido comercial com múltiplas retiradas

**Status:** Aceito  
**Data:** 14/09/2026

## Contexto

Um único pedido pode precisar ser atendido por uma ou mais unidades. Pagamento, operação
e retirada física possuem responsabilidades diferentes.

## Decisão

Separar:

```text
Pedido comercial
└── 1..N retiradas
```

O pagamento pertence ao pedido.

Cada retirada possui:

- unidade;
- status;
- separação;
- QR/token;
- check-in;
- entrega.

## Consequências

Permite:

- atendimento multiunidade;
- rastreabilidade operacional;
- QR por retirada;
- separação independente;
- futura otimização de distribuição.

Evita acoplar pagamento à entrega física de cada unidade.
