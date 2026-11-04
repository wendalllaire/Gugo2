# Revisão 06 — edição direta pela imagem da câmara

## Alterações
- Cada peça detetada que tenha coordenadas `box2d` passa a ter uma área tátil sobreposta à fotografia.
- Tocar/clicar numa área abre o editor individual já existente para essa peça.
- A peça em edição fica realçada a âmbar; as restantes áreas mantêm o realce verde.
- A seleção também funciona por teclado (Enter/Espaço) e inclui rótulos acessíveis.
- A sobreposição usa as mesmas proporções da fotografia, incluindo imagens com barras laterais/superiores por `object-fit: contain`.
- A edição pelo botão do lápis continua disponível como alternativa.

## Testes
- Foram acrescentados testes de contrato ao teste de regressão da câmara para verificar seleção por toque, geometria, realce e acessibilidade.
- O teste automatizado e o build completo ainda precisam de ser executados num ambiente com dependências instaladas.
- A validação visual em Android continua pendente.

## Nota
Peças sem coordenadas de deteção (por exemplo, peças adicionadas manualmente ou resultados da IA sem `box2d`) continuam editáveis pela lista/lápis, mas não têm uma área selecionável na fotografia.
