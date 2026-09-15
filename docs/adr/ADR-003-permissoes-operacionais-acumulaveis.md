# ADR-003 — Permissões operacionais acumuláveis

**Status:** Aceito  
**Data:** 14/09/2026

## Contexto

Uma operação enxuta pode usar a mesma pessoa para separação e retirada. Um único campo
`tipo_usuario` não representa bem esse cenário sem criar perfis híbridos.

## Decisão

Manter `perfil_cliente.tipo_usuario` como perfil principal e criar capacidades operacionais
acumuláveis em:

```text
usuario_permissoes
```

Capacidades iniciais:

```text
separacao
retirada
```

Um usuário pode possuir uma ou ambas.

Função central:

```sql
public.usuario_atual_tem_permissao(text)
```

## Consequências

Positivas:

- evita perfil `separacao_retirada`;
- permite operação enxuta;
- facilita novos papéis no futuro;
- reduz acoplamento entre cargo e autorização.

Durante a transição, regras antigas por `tipo_usuario` permanecem compatíveis e devem ser
migradas gradualmente para capacidades.
