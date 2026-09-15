# ADR-005 — Separação entre homologação e produção

**Status:** Aceito  
**Data:** 14/09/2026

## Contexto

O projeto atual nasceu como protótipo, mas passou a representar a homologação real da
Fase 1 após aprovação do cliente.

Usar o mesmo ambiente como produção carregaria dados de teste, credenciais de sandbox,
histórico experimental e riscos operacionais.

## Decisão

Adotar:

```text
desenvolvimento local
→ homologação estável
→ produção limpa
```

O ambiente atual permanece como homologação da Fase 1.

Produção futura terá:

- Supabase próprio;
- banco limpo;
- credenciais próprias;
- Mercado Pago produção;
- domínio definitivo;
- políticas revisadas;
- logs;
- backups;
- monitoramento;
- secrets próprios.

A implantação deve reutilizar código e migrations, não copiar dados de teste.

## Consequências

- menor risco de vazamento ou configuração incorreta;
- homologação permanece útil para testes futuros;
- produção nasce reproduzível;
- exige disciplina de migrations e documentação.
