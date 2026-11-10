# Escala de enfermagem — arquivos para abrir e publicar

- **escala-enfermagem.html**: versão completa em um único arquivo; abra com duplo clique no navegador, sem instalação.
- **index.html**: página inicial autossuficiente para GitHub Pages ou abertura local; não precisa de arquivos auxiliares.
- **index-modular.html**: alternativa modular que usa `app.js`, `engine.js` e `styles.css`.
- No GitHub, envie os arquivos que estão na raiz do ZIP para a raiz do repositório e habilite **Settings > Pages > Deploy from a branch > main > /(root)**.
- Arquivo `escala-enfermagem.html` é uma alternativa independente e não precisa dos demais arquivos.

> Protótipo experimental. O responsável técnico deve conferir a escala e as restrições assistenciais antes de utilizar no cuidado. Evite registrar informações identificáveis de pacientes.

---

# Escala Assistencial — Protótipo 1.1

Aplicação web **estática**, feita com HTML, CSS e JavaScript puro, para testar a **distribuição diária de pacientes entre profissionais de enfermagem** em dois postos.

> **ATENÇÃO:** protótipo experimental de apoio à decisão. Não é um sistema assistencial homologado. O enfermeiro responsável deve conferir a distribuição e as condições clínicas/organizacionais antes da implementação real. Não registre nomes nem identificadores de pacientes: o armazenamento do navegador não tem as garantias exigidas para um prontuário ou sistema hospitalar de produção.

## 1. Abrir no GitHub Pages (sem instalar nada)

1. Crie um repositório no [GitHub](https://github.com/new), por exemplo `escala-enfermagem`.
2. Extraia o arquivo ZIP e faça upload **dos arquivos e das pastas dentro da pasta do projeto**, para a raiz do repositório. É importante que `index.html`, `styles.css`, `app.js` e `engine.js` fiquem juntos na raiz.
3. No repositório, acesse **Settings > Pages**.
4. Em **Build and deployment**, selecione **Deploy from a branch**. Escolha a branch **main**, diretório **/(root)** e clique em **Save**.
5. Após a publicação, abra o endereço disponibilizado na seção Pages, normalmente `https://SEU-USUARIO.github.io/escala-enfermagem/`.

Não é necessário configurar backend, banco de dados ou serviços pagos. O programa não envia automaticamente dados para o GitHub: somente o **código** é publicado. Os dados de cada escala permanecem no navegador da pessoa que os preenche.

## 2. Rodar no computador

Como os arquivos JavaScript utilizam módulos ES, **não abra `index.html` diretamente com duplo clique**. Utilize um pequeno servidor local, na pasta do projeto:

```bash
python -m http.server 8000
```

Depois abra `http://localhost:8000/` no navegador. É possível usar também a extensão Live Server do VS Code.

## 3. Funcionalidades disponíveis

- **46 leitos físicos** em **23 quartos**: Posto A (201–208 e 220–224) e Posto B (209–212 e 214–219). Quarto 213 excluído.
- Cada leito pode estar **ocupado**, **vago**, **bloqueado** ou **bloqueado por isolamento**. Os três últimos estados nunca entram na distribuição.
- Para **pacientes ocupando leitos**, é possível marcar: **acamado**, **sonda enteral**, **atendimento exclusivo por profissional homem ou mulher** e **precaução adicional** (contato, gotículas, aerossóis).
- **Banhos previstos automaticamente** pelos quartos pares no diurno e ímpares no noturno, com possibilidade de exceções cadastradas por leito.
- Cadastro de até **nove posições de escala**, presença/ausência, categoria (técnico, técnico de apoio ou enfermeiro de cobertura) e restrições de atendimento por profissional.
- **Gerar escala** automaticamente, **redistribuir** preservando atribuições anteriores quando viável, retirar profissional por intercorrência e **alterar atribuições manualmente**.
- **Relatório ao fim da escala** com os **leitos vagos de cada posto por escrito**, separando **leitos bloqueados** e **bloqueados por isolamento**.
- **Revisar para impressão**: alterar vários responsáveis na mesma tabela, salvar somente quando a distribuição completa cumprir todas as regras; personalizar título e observações; incluir ou omitir vagos/bloqueios no documento; usar o comando do navegador para imprimir ou salvar PDF.
- **Impressão**, **exportação CSV**, **backup/importação JSON**, histórico local com restauração de até 20 versões.

### Restrições incorporadas ao algoritmo

| Critério | Comportamento |
|---|---|
| Limite de pacientes | **Máximo de 7 por profissional** (restrição rígida) |
| Banhos previstos | **3 por profissional/turno como regra**; somente com **menos de 8 técnicos**, o algoritmo pode atribuir **4** se não encontrar solução com 3 (nunca mais de 4) |
| Sonda enteral / acamados | Não atribui a profissionais com a correspondente restrição individual (rígida) |
| Exclusividade por sexo do profissional | Leito pode exigir **somente homem** ou **somente mulher**; validação rígida em geração, ajustes e impressão |
| Limite da Escala 1 | **Exclusivamente 223A, 223B, 224A e 224B**, sem exceções, mesmo na personalização manual |
| Número par de técnicos | **Nenhum profissional** pode assumir pacientes de ambos os postos A/B (rígida) |
| Compartilhamento A/B | No máximo **2 profissionais** compartilhados (rígida) |
| Número ímpar de técnicos | Exige **pelo menos um técnico** compartilhando, quando ambos os postos possuem pacientes (rígida) |
| Proporcionalidade geral | Procura diferença de até **1 paciente** por profissional; alerta quando não consegue |
| Proporcionalidade do compartilhado | **Diferença máxima de 1 paciente entre os postos** por técnico compartilhado (rígida) |
| Banhos e acamados | Distribui carga assistencial de forma equilibrada dentro das restrições |
| Proximidade física | Prefere quartos próximos, conserva pares A/B e minimiza fragmentação entre quartos |
| Menos de 7 profissionais | Emite alerta para avaliar reforço/cobertura; a escala gerada continua sujeita à revisão |

O cálculo utiliza um **modelo heurístico de otimização** (fluxo de custo mínimo + ajustes locais). Isso significa que **não garante a solução matemática globalmente ótima** nem determina tempos reais de deslocamento. Se não conseguir respeitar as restrições rígidas, o programa **não força uma escala completa**: informa o conflito e solicita revisão. Se há alertas de proporcionalidade, a distribuição deve ser conferida pelo enfermeiro.

### Proximidade entre quartos

O mapa toma por base as relações informadas para as escalas 1 e 2, para os quartos 208/220/221, 209/218/219, 210/216/217 e 212/214/215, além da faixa compartilhada **217–223**. A proximidade é modelada por **pesos estimados**, não por medições de distância. O arquivo `engine.js` contém a função `buildDistances()` e as áreas preferenciais em `HOME_ROOMS`: ajuste ali após validar a planta física.

**Prevenção de infecção:** atribuir quartos próximos diminui a circulação, mas **não substitui precauções padrão, higienização das mãos, equipamentos de proteção, definição de coortes ou protocolos do SCIH/CCIH**. A marcação de paciente com precaução adicional gera identificação visual, não uma decisão automática de coorte. Leitos **bloqueados por isolamento** são diferentes de leitos **ocupados com paciente isolado**.

## 4. Fluxo de uso sugerido

1. Abra **Equipe**: registre os profissionais do turno, presença, função e restrições.
2. Abra **Mapa de leitos**: informe os ocupados, vagos, bloqueados e bloqueados por isolamento. Somente nos ocupados informe acamados, dieta por sonda e especificidades.
3. Escolha **data e turno**. Confira a previsão de banhos.
4. Clique em **Gerar escala** e revise o quadro e os alertas.
5. Para trocar um leito isolado, clique na etiqueta; para trocar vários leitos simultaneamente, abra **Revisar para impressão**. Para retirar alguém, use **Remanejamento**.
6. Em **Revisar para impressão**, altere os responsáveis nos menus suspensos da tabela. Clique em **Conferir rascunho** e depois em **Salvar alterações e validar**. Se houver impedimento, corrija o rascunho; o salvamento será recusado até resolvê-lo.
7. Opcionalmente, informe **Título do documento**, **Observações para o plantão** e marque/desmarque a inclusão de **vagos e bloqueados**.
8. Confira a **prévia** com o número de pacientes, banhos e acamados por profissional; ao final, clique em **Imprimir / salvar em PDF**. A caixa de impressão do navegador permite escolher papel ou **Salvar como PDF**.
9. Se desejar exportar a distribuição completa como tabela, use **CSV**; para backup, **Exportar dados JSON** (com cuidado de segurança).

## 5. Limitações importantes da versão 1.1

- Armazenamento é local no navegador (`localStorage`), sem usuários/perfis, autenticação, sincronização entre computadores ou cópia em servidor. Apagar dados do navegador pode apagar os registros. Salve backups JSON se necessário.
- O histórico é local, não é trilha de auditoria inviolável ou assinatura eletrônica.
- Os nove registros representam as **Escalas 1 a 9**; enfermeiros de cobertura e técnicos de apoio usam uma dessas posições disponíveis.
- O cadastro da equipe é demonstrativo. A elegibilidade de cada profissional deve ser revisada com base em regras e competências institucionais.
- Não controla horários, administração de dieta, medicação, isolamento/coorte institucional nem protocolos de infecção.
- A otimização territorial considera preferências fornecidas, não um mapa arquitetônico com distância em metros.
- Uma exceção manual de banho deve refletir a programação validada pelo enfermeiro e não pode servir para contornar limites de segurança.
- O botão de impressão abre o diálogo do **navegador**, não gera automaticamente um PDF no servidor.
- A versão 1.1 lê backups e dados locais da versão 1.0, convertendo a restrição antiga “Somente mulher” para o seletor novo.
- Em razão do limite absoluto da Escala 1, a diferença de pacientes entre profissionais poderá ser superior a 1 e será apresentada como alerta; a aplicação **não** quebrará a restrição para obter igualdade matemática.

## 6. Estrutura dos arquivos

```text
escala-enfermagem-prototipo/
├── index.html       # Página inicial
├── styles.css       # Design e impressão
├── app.js           # Interface, formulários, backup e interações
├── engine.js        # Algoritmo de distribuição e validação
├── package.json     # Comando de testes, sem dependências
├── tests/
│   └── engine.test.mjs
└── README.md
```

Para executar os testes (com Node.js moderno):

```bash
npm test
```

Licença de demonstração: utilização e adaptação do protótipo permitidas; não há promessa de adequação para uso clínico em produção.
