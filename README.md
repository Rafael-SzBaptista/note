# Note

Controle de plantões com escalas editáveis, trocas, pagamentos, compromissos e anotações — app web mobile-first (PWA) com visual inspirado no Google Agenda.

```bash
npm install
npm run dev      # abre em http://localhost:5173 (e na rede local, para testar no celular)
npm run build    # gera dist/ instalável como app (PWA)
```

## Funções

- **Hoje**: em plantão agora (com tempo restante), próximo plantão, próxima folga, resumo do mês e alertas.
- **Escalas**
  - Por horas (12x36, 24x48…), por dias (6x1, 5x2…) ou **ciclo** livre (ex.: D D N N F F F F, com turnos Dia/Noite/Manhã… editáveis).
  - **Histórico**: “Mudar a escala a partir de uma data” cria uma nova regra sem alterar plantões passados.
  - Pagamento por plantão, por hora ou salário fixo, com adicional noturno (22h–5h) e feriados nacionais.
- **Plantão individual**: vou trabalhar / troquei / folga-falta, observação e “já recebi”.
- **Trocas**: registra quem cobriu seu plantão e os plantões que você cobre; saldo por colega (“você deve 1”, “te deve 2”).
- **Plantões extras** com valor e status de pagamento; **coberturas**; **compromissos** (com repetição) e **anotações**.
- **Alertas** de choque de horário e de descanso menor que o mínimo (padrão 11h) entre plantões, inclusive de empregos diferentes.
- **Resumo e pagamentos** do mês (previsto, recebido, a receber) e **relatório em PDF** (via impressão do navegador).
- **Lembretes** por notificação antes dos plantões e compromissos.
- **Busca** em compromissos, anotações, escalas, colegas e locais.
- **Feriados nacionais** do Brasil na agenda.

## Limitações conhecidas

- Os dados ficam salvos só no aparelho (localStorage). Não há backup nem sincronização.
- Lembretes: sem servidor de push, os avisos só chegam com o app aberto ou em segundo plano recente. No iPhone, só funcionam com o app instalado na tela inicial (iOS 16.4+).
- Os valores são estimativas a partir das regras cadastradas (não consideram hora noturna reduzida, descontos ou convenções específicas).

## Estrutura

- `src/lib/` — regras de negócio: geração de plantões e versões (`items.ts`), dinheiro (`money.ts`), conflitos (`conflicts.ts`), trocas (`trocas.ts`), feriados (`holidays.ts`), lembretes (`reminders.ts`), dados e migração (`store.ts`).
- `src/components/` — telas e visões.
