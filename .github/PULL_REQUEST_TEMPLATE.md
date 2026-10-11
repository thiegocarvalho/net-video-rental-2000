## O que muda

## Como testar
Servidor local (`npx http-server -p 8080 -c-1`), com `?debug` quando útil.

## Checklist
- [ ] Commits em Conventional Commits
- [ ] `node --check` passa nos arquivos alterados (e `node tools/check-i18n.mjs` se mexeu em `src/i18n/`)
- [ ] Objetos que mudam de transformação têm `userData.dynamic = true`; mobiliário novo tem entrada em `solids`
- [ ] Modelos novos com `.credits.txt` ao lado
- [ ] Sem texto visível novo fora de `src/i18n/` quando a migração do módulo já tiver sido feita
