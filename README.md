# LeFe Home V16

## Novidade
Módulo **🛍️ Compras Planejadas**.

Serve para guardar compras futuras sem exigir data de compra.

### Recursos
- Adicionar pelo link do produto
- Tentar buscar automaticamente nome, descrição, preço, loja e imagem
- Preenchimento manual quando a loja não permite leitura automática
- Categorias
- Status: Quero comprar, Pesquisando, Aguardando, Comprada, Desistimos
- Total planejado
- Abrir o produto original

## Backend
No Apps Script, criar um arquivo chamado `ComprasPlanejadasApi.gs` com o conteúdo deste projeto e executar uma vez:

`configurarModuloComprasPlanejadas`

Depois substituir o `Api.gs` pela versão V16 fornecida no pacote.

## Frontend
Enviar para o GitHub os arquivos do frontend, principalmente:
- index.html
- app.js
- style.css
- service-worker.js
- manifest.json
- assets/

Não colocar arquivos `.gs` no GitHub.

## Observação sobre links
A busca automática depende dos metadados que a loja disponibiliza e pode ser bloqueada por algumas lojas. Quando isso acontecer, o formulário continua permitindo preencher os dados manualmente.
