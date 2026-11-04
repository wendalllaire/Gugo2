# Revisão 07 — câmara em ecrã inteiro e contagem visual

## Alterações
- Ao abrir a câmara, o visor passa a ocupar todo o ecrã (100dvh), com vídeo a preencher a área disponível.
- Foram adicionados controlos sobrepostos para fechar a câmara e tirar a fotografia sem sair do visor.
- A barra de ações normal fica oculta enquanto a câmara está ativa.
- Na fotografia analisada, cada peça com coordenadas de deteção mantém a caixa tátil turquesa para edição direta.
- Cada caixa apresenta uma etiqueta escura no canto superior esquerdo com os pontos daquela peça.
- A soma de pontos da mão aparece centrada no rodapé da imagem, seguindo a referência visual fornecida.
- O total usa `visionResult.totalPoints`, pelo que acompanha as edições e remoções de peças.

## Testes
- Foram acrescentados testes de contrato para o modo de ecrã inteiro, controlos de captura/fecho, etiquetas por peça e soma.
- O build completo e a execução dos testes num ambiente com dependências instaladas ainda estão pendentes.
- A validação visual num dispositivo Android continua pendente.

## Nota
A etiqueta apresenta a pontuação da peça (`piece.points`), tal como na captura de referência, e não um índice sequencial da lista. Peças sem `box2d` continuam sem caixa/etiqueta sobre a fotografia, mas mantêm a edição pela lista.
