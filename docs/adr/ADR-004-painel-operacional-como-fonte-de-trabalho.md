# ADR-004 — Painel operacional como fonte de trabalho

**Status:** Aceito  
**Data:** 14/09/2026

## Contexto

Eventos normais da operação acontecem continuamente. Se cada pedido pago, separação,
check-in ou entrega gerar notificação interna, operadores que entrarem mais tarde podem
receber alertas já ultrapassados.

## Decisão

Usar painéis operacionais como fonte oficial de trabalho interno.

Eventos normais:

```text
pedido pago
separação
pronto
check-in
entrega
```

devem aparecer no estado atual do painel.

Notificações internas ficam reservadas para exceções que realmente exigem atenção.

Notificações ao cliente continuam válidas para mudanças relevantes, pois o cliente não
mantém o painel aberto.

## Consequências

- menos ruído;
- operador vê sempre o estado atual;
- notificações mantêm valor de alerta;
- histórico operacional permanece no sistema sem virar caixa de entrada atrasada.
