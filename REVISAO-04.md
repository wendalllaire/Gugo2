# Revisão 04 — galeria, contador e segurança da pontuação

## Alterações
1. A seleção de imagem usa um input de ficheiro com tipos de imagem comuns e sem `capture`, com a ação apresentada como **Escolher da Galeria**.
2. A câmara continua separada, através de `getUserMedia`.
3. O input é limpo após a seleção para permitir selecionar novamente o mesmo ficheiro.
4. O resumo apresenta quantidade de peças e pontos totais.
5. O motor offline deixou de substituir falhas de deteção por uma mão fictícia de 42 pontos.
6. Não é possível gravar a mão quando não foram identificadas peças.

## Testes executados
- `node --test tests/camera-tab-regression.test.mjs`: 4/4 passaram.
- `python scripts/verify-reference-image.py`: passou; identificou 40 pips, três peças (11–7, 11–1, 6–4) e 40 pontos.
- Transpilação isolada de `CameraTab.tsx` com TypeScript `transpileModule`: sem erros de sintaxe.

## Limitações conhecidas
- Não foi possível executar `npm install` no ambiente (a instalação ficou bloqueada/sem concluir).
- Por isso, o build Vite completo e o teste manual num dispositivo Android ainda não foram validados nesta sessão.
- O teste OpenCV da fotografia de referência usa a geometria conhecida dessa fotografia e não substitui a validação geral do motor offline no browser.
- A seleção da galeria depende do seletor de ficheiros fornecido pelo Android/navegador. A aplicação não pode obrigar todos os fabricantes a abrir diretamente uma aplicação de galeria específica.

## Ficheiros principais
- `src/components/CameraTab.tsx`
- `tests/camera-tab-regression.test.mjs`
- `scripts/verify-reference-image.py`
- `public/samples/IMG_20261102_231406.jpg`
- `public/samples/IMG_20261102_231406-annotated.jpg`
- `VALIDATION-REFERENCE-IMAGE.md`
