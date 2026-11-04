# Validação da fotografia de referência

Fotografia: `public/samples/IMG_20261102_231406.jpg`

Resultado de QA executado com OpenCV (HoughCircles + agrupamento horizontal + deteção da divisória):

- Dominó 1: 11–7 = 18 pontos
- Dominó 2: 11–1 = 12 pontos
- Dominó 3: 6–4 = 10 pontos
- Total: **40 pontos**

Comando (requer Python, OpenCV e NumPy):

```bash
python scripts/verify-reference-image.py
```

**Âmbito:** este teste reproduz a validação desta fotografia específica. Não representa uma garantia de que o algoritmo genérico de visão computacional do browser reconheça automaticamente todas as fotografias. O teste de referência usa geometria conhecida desta imagem. O motor genérico deve continuar a ser validado com fotografias variadas.

## Alterações desta revisão

- O seletor de ficheiros mantém `accept` de imagens e não usa o atributo `capture`, para permitir ao Android apresentar o seletor de origem (incluindo galeria).
- A ação está identificada como **Escolher da Galeria**; a câmara permanece numa ação separada via `getUserMedia`.
- O valor do input é limpo depois da seleção para permitir escolher novamente a mesma fotografia.
- O motor offline deixou de inventar três peças (42 pontos) quando não deteta peças. Em caso de falha, mostra zero peças/zero pontos e uma mensagem de correção manual.
- O resumo apresenta explicitamente a quantidade de peças e a pontuação total.
