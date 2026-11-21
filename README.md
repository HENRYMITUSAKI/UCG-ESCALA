# Escala Assistencial — protótipo v1.9

Abra `index.html` com dois cliques, ou substitua esse arquivo no seu GitHub Pages.
O HTML é independente, sem servidor ou bibliotecas externas. A versão modular está
em `index-modular.html`, `styles.css`, `engine.js`, `planning.js` e `app.js`.

## Novidades desta versão

- Visual reorganizado em azul, com os pacientes em primeiro plano, nomes mais
  legíveis, resumo compacto e motivos dos alertas em seção expansível.
- O redimensionamento permite **adicionar técnico**, **retirar técnico** ou
  **apenas recalcular**. Na entrada, preencha o profissional, posto, sexo,
  competências e PCR. É possível trazer de volta um profissional ausente.
- Na entrada, escolha redistribuir automaticamente ou manter os pacientes para
  ajuste manual. Na saída, continuam disponíveis o recálculo completo e a
  redistribuição exclusiva dos pacientes de quem saiu.
- A numeração e a impressão acompanham o tamanho atual da equipe. Se as nove
  posições estiverem ocupadas, uma nova posição é criada; o backup preserva as
  posições adicionais. Os novos profissionais seguem o posto cadastrado.
- Modelo de impressão consolidado em **uma folha A4 em paisagem**. Todo o
  conteúdo é medido, incluindo enfermeiros, técnicos, PCR, apoios, pendências,
  Fugulin, vagos, bloqueados, observações e assinaturas. O ajuste usa transformação
  proporcional, com reserva nas bordas e no rodapé. Textos extensos podem reduzir
  o tamanho da letra para manter a folha única.
- Os campos de PCR ficam na Equipe e na revisão; a escala principal mostra
  somente as identificações já definidas. Os enfermeiros aparecem em cartões
  por área, e os apoios têm um resumo compacto na escala.

## Como adicionar um técnico

1. Abra Redimensionamento em qualquer tela, ou Adicionar técnico na Equipe.
2. Escolha Adicionar técnico; cadastre o nome ou selecione alguém ausente.
3. Confira posto, sexo, competências e, se desejado, a identificação na PCR.
4. Escolha a redistribuição automática ou a manutenção para ajuste manual.
5. Aplique o redimensionamento e confira a equipe atualizada na revisão.

Cancelar não altera a presença nem os pacientes. Marcar Presente no plantão de
um profissional ausente abre esse mesmo fluxo.

## Funcionalidades preservadas da versão 1.8

- Botão **Redimensionamento** em todas as telas e atalho flutuante para acesso
  mesmo após rolar a página. Escolha entre recalcular toda a escala ou redistribuir
  apenas os pacientes do técnico que está saindo. A retirada pelo botão ou pela
  caixa de presença abre o mesmo diálogo. Cancelar mantém o profissional na equipe.
- A saída atualiza imediatamente a numeração na tela e na impressão. De 8 para 7,
  permanecem as Escalas 1 a 7: a última pessoa preenche a posição de quem saiu.
  Nomes, restrições, função e identificação na PCR acompanham o profissional.
  Na opção parcial, os pacientes dos sobreviventes também acompanham o profissional;
  eventuais conflitos territoriais ou de compartilhamento decorrentes da mudança
  são sinalizados para a revisão. Nenhum paciente é atribuído silenciosamente a
  outra pessoa por causa da troca de número.
- Quando não consegue completar a escala, a busca mantém uma distribuição parcial
  respeitando a elegibilidade, os territórios e os limites de cada atribuição
  automática. Os leitos sem responsável aparecem para ajuste por clique ou arraste.
  Pendências de composição da equipe ficam indicadas para revisão, inclusive quando
  a equipe ímpar ainda não permite concluir o compartilhamento. A busca continua
  heurística e não garante a maior distribuição global possível.
- Quadro **Técnicos de apoio**, com nome e função livres, inicialmente em branco,
  e opção de adicionar ou remover linhas. Estes apoios não integram o cálculo dos
  pacientes: para atuar na distribuição, use as posições de equipe existentes.
  Os apoios aparecem na escala, na Equipe, na revisão, na impressão e no CSV/JSON.
- Campo **Função na PCR** por técnico e apoio: vazio, A, B, C ou D. Identificação
  na tela e coluna própria na impressão. Não há atribuições clínicas pré-definidas;
  o enfermeiro seleciona as letras conforme a organização do hospital.

## Funcionalidades preservadas da versão 1.7

- Equilíbrio reforçado de banhos, acamados e preparos cirúrgicos, considerados
  individualmente e em conjunto. A busca pode fazer realocações, trocas entre
  dois técnicos e ciclos entre três, sempre com pacientes do mesmo posto e
  conferindo todas as restrições antes de aceitar a nova distribuição.
- Preparo cirúrgico marcado por paciente ou em lote, com contagem por técnico
  e identificação `PC` dos leitos na tela e na impressão. CSV e JSON preservam
  a informação. Backups anteriores assumem a opção desmarcada.
- Com três enfermeiros, o quadro de impressão fica na ordem **A | AB | B**.
- Impressão em uma folha A4, em paisagem, com nomes ampliados e enfermeiros em
  um quadro separado na mesma folha. O aplicativo mede o conteúdo e ajusta o
  tamanho para acomodar a escala, os relatórios e as observações.
- Leitos em ordem numérica e agrupados por quarto: `201AB`, `202A`, `203AB`.
  Na tela, as letras A e B continuam sendo botões individuais para ajustes.
  Os leitos de um profissional ficam juntos, com uma linha por posto.
- Cadastro independente dos enfermeiros com quantidade ajustável entre 2, 3 e 4.
- Remanejamento com a roda: a última escala ativa assume a posição de quem saiu;
  as demais posições são mantidas e a última fica inativa. Os pacientes são
  redistribuídos conforme as regras já cadastradas.

## Equilibrar cuidados e preparos cirúrgicos

No Mapa de leitos, marque Preparo cirúrgico nos pacientes correspondentes.
Também é possível selecionar leitos e aplicar ou retirar a marcação em lote.
Depois, clique em Gerar escala ou Redistribuir para aplicar o novo equilíbrio.
Uma escala salva não é alterada automaticamente ao atualizar o aplicativo.

O cálculo prioriza a distribuição dos banhos, dos acamados, dos preparos e da
soma dessas demandas entre os técnicos que podem assumir os pacientes, dentro
do posto. Evita, por exemplo, manter uma pessoa com 3 banhos e 3 acamados quando
existir uma troca permitida que reduza a concentração. O equilíbrio tem
prioridade sobre manter a atribuição anterior e sobre agrupar quartos.

Os limites de pacientes e banhos, as competências, as restrições por sexo,
os leitos permitidos para a Escala 1 e a regra de compartilhamento continuam
obrigatórios. Quando uma restrição impede o equilíbrio perfeito, o programa
preserva a restrição e apresenta alertas de concentração, sem transferir uma
escala inteira para outro posto. A edição manual continua livre, com alertas.

O preparo representa uma demanda adicional de organização da escala. A soma
usada na busca é uma preferência operacional, não uma medida clínica validada.

## Enfermeiros e possíveis admissões

Na própria escala, na revisão ou na aba Equipe, preencha os nomes e escolha a
quantidade presente:

| Enfermeiros | Divisão |
| --- | --- |
| 2 | Um no Posto A e um no Posto B |
| 3 | Enfermeiro A, Enfermeiro B e Enfermeiro AB; impressão A / AB / B |
| 4 | Dois no Posto A e dois no Posto B |

Com 3, a distribuição habitual prioriza A nos quartos 201–208 e B em 209–216,
sem o quarto 213. O AB recebe a faixa de transição. O A pode assumir 224 e 223
quando necessário para equilibrar a cobertura. Os quartos são mantidos juntos
quando isso permite uma diferença de até dois leitos; casos mais desequilibrados
priorizam a proporcionalidade.

Cada leito ocupado e cada leito vago contam como uma posição a cobrir. Assim,
quem recebe mais vagos/possíveis admissões fica com menos pacientes atuais,
dentro das áreas disponíveis. Bloqueados e bloqueados por isolamento ficam de
fora da divisão. Com 2 ou 4 enfermeiros, o equilíbrio respeita cada posto.

Para ajustar manualmente, arraste um leito dentro do quadro dos enfermeiros,
ou clique no leito e depois no posto do enfermeiro de destino. Um enfermeiro A
ou B permanece no seu posto; o AB pode receber ambos. O botão Reequilibrar
enfermeiros limpa esses ajustes e recalcula a divisão. Alterar a quantidade
também recalcula. Os nomes ficam preservados por área ao trocar a quantidade.
Esses ajustes não alteram as atribuições dos técnicos.

Os dados dos enfermeiros entram na impressão, no CSV, no backup JSON e no
histórico. Backups anteriores continuam compatíveis.

## Impressão em folha única

Use Revisar / imprimir e depois Imprimir / salvar em PDF. O modelo usa A4
em paisagem, margens de 7 mm e nomes de 14 pontos antes do ajuste automático.
Enfermeiros ficam em quadro separado acima dos técnicos. Os leitos vagos e
bloqueados aparecem por posto; o resumo de Fugulin permanece incluído.
Nomes ou observações extensos podem reduzir a escala automaticamente.
O conteúdo é medido em largura e altura, com reserva contra arredondamento e
uma área fixa de 280 × 190 mm para evitar uma segunda página vazia. O quadro
dos técnicos inclui os totais de preparo; `PC` identifica os leitos correspondentes.

Confira se a prévia do navegador indica uma página. O tamanho do papel, a
orientação, a escala e os cabeçalhos/rodapés definidos na janela da impressora
podem alterar o resultado. A configuração inicial do aplicativo utiliza A4
em paisagem; a janela real de impressão deve ser conferida no dispositivo.

## Roda no remanejamento

O diálogo mostra a troca antes de aplicar. Exemplo: saindo a Escala 1 de uma
equipe com posições 1 a 7, a pessoa da 7 assume a 1; de 2 a 6 nada muda; a 7
fica inativa. Nome, categoria e restrições individuais acompanham a pessoa.
O posto de referência e as regras territoriais pertencem à posição de destino.
Se sair a última escala, apenas ela fica inativa.

O histórico permite restaurar a configuração anterior. Se a redistribuição
automática não encontrar uma solução, a saída e a roda são mantidas e as
pendências ficam visíveis para ajuste manual.

Antes de substituir a versão em uso, exporte seu backup JSON em Regras e dados.
A chave de armazenamento da versão anterior foi mantida. Ao abrir em outro endereço,
pasta ou navegador, importe o backup para recuperar os dados.

## Personalização e impressão

- Arraste o leito até a linha do técnico, ou clique no leito e depois no nome da escala.
- Funciona na própria escala e na aba Revisar para impressão. Cada movimento é salvo
  automaticamente e transfere o paciente, sem duplicá-lo.
- Leitos ocupados sem responsável também podem ser selecionados e atribuídos.
- A edição manual é livre. Alertas ficam em uma seção recolhível para conferência.
- Imprimir / salvar em PDF abre a impressão mesmo com exceções, dados alterados ou
  pacientes sem responsável. As pendências de atribuição e a indicação de revisão
  manual aparecem no documento. Não é necessário gerar novamente para imprimir.
- Título e observações ficam em uma seção recolhível.

## Preencher os 46 leitos

Os quartos ficam agrupados por posto. Há quatro botões diretos de situação:
ocupado, vago, bloqueado e bloqueado por isolamento.

Selecione um posto inteiro, todos os leitos ou leitos individuais e aplique uma
situação em lote. Também é possível marcar/desmarcar acamados e preparos em lote.
Ao mudar a situação de um leito, os dados do paciente e sua atribuição são limpos
para evitar reutilizar informações da ocupação anterior. Marcar novamente a mesma
situação não apaga os dados. O histórico guarda o estado anterior às ações em lote.

Nos ocupados, Fugulin, acamado, sonda enteral e preparo cirúrgico ficam diretamente acessíveis.
Restrições por sexo, banho excepcional e precauções ficam em Mais opções, com
indicação das exceções no título. Enter ou Tab no Fugulin avança para o próximo
campo de pontuação visível.

## Regras automáticas preservadas

- Até 7 pacientes por profissional.
- Até 3 banhos; com menos de 8 técnicos, até 4 somente quando a busca com 3 falhar.
- Restrições por sexo e competências para acamados e sonda enteral.
- Escala 1: habituais 201–205, extras somente 223A/B e 224A/B.
- O posto cadastrado na aba Equipe é obrigatório, inclusive para as Escalas 4 e 7
  quando não estiverem no compartilhamento autorizado. Com equipe par, ninguém
  cruza os postos. Com equipe ímpar, somente 4 e/ou 7 podem compartilhar; não
  são deslocadas inteiramente para o outro posto para melhorar o equilíbrio. Com
  pacientes em ambos,
  tenta-se um compartilhado antes de dois, com diferença
  máxima de um paciente entre os postos atendidos pelo compartilhado.
- Postos iniciais: A nas Escalas 1, 2, 3, 4 e 9; B nas Escalas 5, 6, 7 e 8.
  O campo Posto de referência permite designar explicitamente a cobertura na aba
  Equipe. O motor não transfere um técnico para outro posto para encontrar solução.
- Acamados: respeitar a aptidão, evitar concentração e escala só com acamados.
- Proximidade, quartos em conjunto e circulação continuam sendo considerados.
- Quando a busca não completa a distribuição, aproveita as atribuições possíveis
  e apresenta os pacientes pendentes para revisão. A busca é heurística; não garante
  ótimo global. A opção de redistribuir apenas quem saiu preserva os demais pacientes
  e sinaliza as exceções que já existiam ou surgiram na nova composição.

## Fugulin

Registre a pontuação total inteira, de 9 a 36. Vazio significa Não informado;
não é interpretado como cuidados mínimos. A impressão lista os leitos ocupados
por classificação, inclusive os que ainda não receberam técnico.

| Pontos | Classificação |
| --- | --- |
| 9–14 | Cuidados mínimos |
| 15–20 | Cuidados intermediários |
| 21–26 | Alta dependência |
| 27–31 | Cuidados semi-intensivos |
| 32–36 | Cuidados intensivos |

Referência das faixas: instrumento de nove áreas reproduzido pelo HC-FMRP/USP:
https://hcrp.usp.br/revistaqualidade/uploads/Artigos/12/12.pdf

O equilíbrio dos totais informados de Fugulin é um objetivo complementar de baixo
peso. Não muda a elegibilidade nem permite ultrapassar limites ou regras dos postos.
O acamado continua sendo considerado independentemente da pontuação. O peso usado
na otimização é uma preferência do protótipo, não uma fórmula clínica validada.
Os valores e classificações também são exportados no CSV e preservados no JSON.

## Verificação

`npm run build` recompõe o `index.html` independente a partir dos arquivos
modulares. Execute-o antes de publicar alterações no código modular.

`npm test` executa 76 testes de regras, classificação, enfermeiros, possíveis
admissões, roda, persistência, compatibilidade com backups antigos e eventos
da interface em ambiente simulado. Inclui movimentação por clique, transferência
por evento de arraste, chamada de impressão com pendências, ajuste da área A4,
marcação de preparos, ordem A/AB/B e regressões de sobrecarga de cuidados.
Inclui os dois modos de redimensionamento, retirada pela presença, atualização
imediata da impressão de 8 para 7, compatibilidade com lacunas antigas,
distribuição parcial, pacientes dos sobreviventes preservados, apoios e PCR.
A versão 1.9 também cobre entrada e retorno de técnicos, inclusão da décima posição, persistência de equipes ampliadas, entrada sem redistribuição e manutenção das categorias. A leitura visual e as opções de impressão devem ser conferidas no dispositivo.

Dados locais, sem sincronização. Não registre identificadores de pacientes.
Distribuição sujeita à revisão do enfermeiro responsável. Protótipo sem homologação
institucional; isolamento não substitui os protocolos de controle de infecção.
