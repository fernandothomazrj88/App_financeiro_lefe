const API_URL='https://script.google.com/macros/s/AKfycbxvqJpcrAHSgxTDJ7-U_spCaCmJf2oCbOl5qo3ULdH0lWdggkJYqJhkQCLzkib0t_yEvg/exec';

let sessao={
  token:localStorage.getItem('vf_token'),
  usuario:JSON.parse(localStorage.getItem('vf_usuario')||'null')
};

let moduloAtual=null;
let subtelaModulo=null;

document.addEventListener('DOMContentLoaded',iniciarApp);

if('serviceWorker' in navigator){
  window.addEventListener('load',async()=>{
    try{
      const reg=await navigator.serviceWorker.register('./service-worker.js?v=20');
      await reg.update();
      console.log('LeFe Home PWA v20 ativo.',reg.scope);
    }catch(err){
      console.warn('Falha ao registrar PWA:',err);
    }
  });
}

function iniciarApp(){
  configurarLogin();
  configurarLogout();
  configurarModulos();
  $('btn-voltar').addEventListener('click',voltarModuloOuHome);
  $('btn-logout-modulo').addEventListener('click',sair);
  if(sessao.token&&sessao.usuario) abrirHome(); else abrirLogin();
}

function configurarLogin(){
  $('form-login').addEventListener('submit',async e=>{
    e.preventDefault();
    const usuario=$('usuario').value.trim();
    const senha=$('senha').value;
    const botao=$('btn-login');
    const mensagem=$('mensagem-login');
    mensagem.textContent='';
    botao.disabled=true;
    botao.textContent='Entrando...';
    try{
      const r=await chamarApi({action:'login',usuario,senha});
      if(!r.sucesso) throw new Error(r.erro||'Não foi possível entrar.');
      sessao={token:r.token,usuario:r.usuario};
      localStorage.setItem('vf_token',r.token);
      localStorage.setItem('vf_usuario',JSON.stringify(r.usuario));
      abrirHome();
    }catch(err){
      mensagem.textContent=err.message;
    }finally{
      botao.disabled=false;
      botao.textContent='Entrar';
    }
  });
}

function configurarLogout(){
  $('btn-logout').addEventListener('click',sair);
}

function configurarModulos(){
  document.querySelectorAll('.modulo').forEach(b=>{
    b.addEventListener('click',()=>abrirModulo(b.dataset.modulo));
  });
}

function abrirLogin(){
  subtelaModulo=null;
  mostrarTela('tela-login');
  window.scrollTo(0,0);
}

function abrirHome(){
  subtelaModulo=null;
  moduloAtual=null;
  mostrarTela('tela-home');
  window.scrollTo(0,0);

  const nome=sessao.usuario?.nome||'';
  const login=(sessao.usuario?.usuario||'').toLowerCase();
  $('nome-usuario').textContent=nome+' 👋';

  const hero=document.querySelector('.hero-personalizado');
  const imagem=$('hero-usuario');
  const frase=$('hero-frase');

  hero.classList.remove('leticia','fernando');

  if(login==='leticia'){
    hero.classList.add('leticia');
    imagem.src='assets/leticia-home.png';
    imagem.alt='Letícia';
    frase.innerHTML='Disciplina hoje,<br>liberdade <strong>amanhã</strong> 🧡';
  }else if(login==='fernando'){
    hero.classList.add('fernando');
    imagem.src='assets/fernando-home.png';
    imagem.alt='Fernando';
    frase.innerHTML='Planejamento hoje,<br>conquistas <strong>sempre</strong> 🧡';
  }else{
    imagem.src='assets/casal-login.png';
    frase.innerHTML='';
  }
}

function mostrarTela(id){
  ['tela-login','tela-home','tela-modulo'].forEach(x=>{
    $(x).classList.toggle('escondido',x!==id);
  });
}

async function sair(){
  try{
    if(sessao.token) await chamarApi({action:'logout',token:sessao.token});
  }catch(e){}
  localStorage.removeItem('vf_token');
  localStorage.removeItem('vf_usuario');
  sessao={token:null,usuario:null};
  $('senha').value='';
  abrirLogin();
}

async function voltarModuloOuHome(){
  const financeiroSubtela=[
    'registrar-pagamento',
    'nova-despesa',
    'nova-receita'
  ];

  if(moduloAtual==='financeiro' && financeiroSubtela.includes(subtelaModulo)){
    subtelaModulo=null;
    const c=$('modulo-conteudo');
    c.innerHTML='<div class="carregando">Carregando...</div>';
    try{
      await renderFinanceiro(c);
      rolarModuloTopo();
    }catch(e){
      c.innerHTML='<div class="erro">'+esc(e.message)+'</div>';
    }
    return;
  }

  if(moduloAtual==='compras-planejadas' && subtelaModulo==='nova-compra-planejada'){
    subtelaModulo=null;
    const c=$('modulo-conteudo');
    c.innerHTML='<div class="carregando">Carregando...</div>';
    try{
      await renderComprasPlanejadas(c);
      rolarModuloTopo();
    }catch(e){
      c.innerHTML='<div class="erro">'+esc(e.message)+'</div>';
    }
    return;
  }

  if(moduloAtual==='casa' && subtelaModulo==='nova-tarefa-casa'){
    subtelaModulo=null;
    const c=$('modulo-conteudo');
    c.innerHTML='<div class="carregando">Carregando...</div>';
    try{
      await renderCasa(c);
      rolarModuloTopo();
    }catch(e){
      c.innerHTML='<div class="erro">'+esc(e.message)+'</div>';
    }
    return;
  }

  abrirHome();
}

async function abrirModulo(modulo){
  moduloAtual=modulo;
  subtelaModulo=null;
  mostrarTela('tela-modulo');
  rolarModuloTopo();

  const c=$('modulo-conteudo');
  c.innerHTML='<div class="carregando">Carregando...</div>';

  try{
    if(modulo==='financeiro') await renderFinanceiro(c);
    else if(modulo==='casa') await renderCasa(c);
    else if(modulo==='compras-planejadas') await renderComprasPlanejadas(c);
    else if(modulo==='mercado') await renderMercado(c);
    else if(modulo==='relatorios') await renderRelatorios(c);
    else if(modulo==='calendario') await renderCalendario(c);
    else if(modulo==='comprovantes') await renderComprovantes(c);
    else if(modulo==='configuracoes') await renderConfiguracoes(c);
  }catch(e){
    c.innerHTML='<div class="erro">'+esc(e.message)+'</div>';
    if(String(e.message).toLowerCase().includes('sessão')){
      setTimeout(sair,900);
    }
  }
}

/* =========================================================
   FINANCEIRO
========================================================= */

async function renderFinanceiro(c){
  subtelaModulo=null;
  const ref=referenciaAtual();

  const [resumo,lista]=await Promise.all([
    chamarApi({action:'resumoFinanceiro',token:sessao.token,referencia:ref}),
    chamarApi({action:'listarFinanceiro',token:sessao.token,referencia:ref})
  ]);

  assertOk(resumo);
  assertOk(lista);

  c.innerHTML=
    `<div class="cabecalho-financeiro">
      ${cabecalho('🪙','Financeiro','Contas, pagamentos e comprovantes')}
      <div class="acoes-nova-financeiro">
        <button id="btn-nova-despesa" type="button" class="botao-nova-despesa">＋ Despesa</button>
        <button id="btn-nova-receita" type="button" class="botao-nova-receita">＋ Receita</button>
      </div>
    </div>`+
    `<div class="cards-resumo">
      <div class="card-resumo"><small>Entradas</small><strong class="verde">${moeda(resumo.dados.entradas)}</strong></div>
      <div class="card-resumo"><small>Saídas</small><strong class="vermelho">${moeda(resumo.dados.saidas)}</strong></div>
      <div class="card-resumo"><small>Saldo do mês</small><strong class="${resumo.dados.saldo>=0?'verde':'vermelho'}">${moeda(resumo.dados.saldo)}</strong></div>
      <div class="card-resumo"><small>Atrasadas</small><strong class="vermelho">${moeda(resumo.dados.atrasado)}</strong></div>
    </div>
    <div class="painel">
      <div class="painel-titulo"><h3>Contas do mês</h3><span>${lista.dados.length}</span></div>
      <div class="lista-modulo">
        ${lista.dados.length?lista.dados.map(itemFinanceiro).join(''):'<div class="vazio">Nenhum lançamento neste mês.</div>'}
      </div>
    </div>`;

  $('btn-nova-despesa').addEventListener('click',async()=>{
    await renderNovaDespesa(c);
  });

  $('btn-nova-receita').addEventListener('click',async()=>{
    await renderNovaReceita(c);
  });

  c.querySelectorAll('[data-liquidar-id]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      const id=btn.dataset.liquidarId;
      const item=(lista.dados||[]).find(x=>String(x.id)===String(id));
      if(!item) return toast('Lançamento não encontrado.');
      await renderRegistrarPagamento(c,item);
    });
  });
}

function itemFinanceiro(x){
  const st=String(x.status||'').toLowerCase().replaceAll('_','');
  const ehReceita=x.tipo==='RECEITA';
  const podeLiquidar=
    (x.tipo==='DESPESA' && ['A_PAGAR','ATRASADO'].includes(String(x.status||'').toUpperCase())) ||
    (x.tipo==='RECEITA' && String(x.status||'').toUpperCase()==='A_RECEBER');
  const textoBotao=ehReceita?'💰 Registrar recebimento':'💳 Registrar pagamento';

  return `<div class="item-lista item-financeiro">
    <div class="info-item-financeiro">
      <div class="descricao">${esc(x.descricao||'Sem descrição')}</div>
      <div class="meta">${esc(x.categoria||'')} ${x.vencimento?'• '+dataBR(x.vencimento):''}</div>
      <span class="badge ${st}">${esc(String(x.status||'').replaceAll('_',' '))}</span>
    </div>
    <div class="lado-item-financeiro">
      <div class="valor ${ehReceita?'verde':'vermelho'}">${ehReceita?'+ ':'- '}${moeda(x.valor)}</div>
      ${podeLiquidar?`<button class="botao-pagar" data-liquidar-id="${escAttr(x.id)}">${textoBotao}</button>`:''}
    </div>
  </div>`;
}

async function renderNovaDespesa(c){
  subtelaModulo='nova-despesa';
  rolarModuloTopo();

  let categorias=[
    'Moradia',
    'Energia',
    'Internet',
    'Telefone',
    'Cartões',
    'Dívidas',
    'Assinaturas',
    'Educação',
    'Mercado',
    'Saúde',
    'Transporte',
    'Lazer',
    'Outros'
  ];

  try{
    const r=await chamarApi({
      action:'listarConfig',
      token:sessao.token,
      tipo:'CATEGORIA_DESPESA'
    });
    assertOk(r);

    const configuradas=(r.dados||[])
      .map(x=>String(x.nome||'').trim())
      .filter(Boolean);

    if(configuradas.length) categorias=[...new Set(configuradas)];
  }catch(e){
    // Mantém categorias padrão para que o cadastro continue disponível.
  }

  const ref=referenciaAtual();
  const refInput=ref.split('/').reverse().join('-');

  c.innerHTML=
    cabecalho('💸','Nova despesa','Cadastre uma nova conta ou gasto')+
    `<form id="form-nova-despesa" class="form-pagamento form-nova-despesa">

      <label class="campo-pagamento">
        <span>📝 Descrição *</span>
        <input id="despesa-descricao" type="text" maxlength="120" placeholder="Ex.: Conta de luz" required>
      </label>

      <label class="campo-pagamento">
        <span>💲 Valor *</span>
        <input id="despesa-valor" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0,00" required>
      </label>

      <label class="campo-pagamento">
        <span>🏷️ Categoria *</span>
        <select id="despesa-categoria" required>
          <option value="">Selecione uma categoria</option>
          ${categorias.map(x=>`<option value="${escAttr(x)}">${esc(x)}</option>`).join('')}
        </select>
      </label>

      <label class="campo-pagamento">
        <span>📅 Vencimento *</span>
        <input id="despesa-vencimento" type="date" value="${dataInputHoje()}" required>
        <small class="ajuda-campo">Se a data já passou, a conta será criada como atrasada.</small>
      </label>

      <label class="campo-pagamento">
        <span>🗓️ Referência *</span>
        <input id="despesa-referencia" type="month" value="${escAttr(refInput)}" required>
        <small class="ajuda-campo">É o mês ao qual esta despesa pertence.</small>
      </label>

      <label class="campo-pagamento">
        <span>🔁 Recorrente</span>
        <select id="despesa-recorrente">
          <option value="NÃO">Não</option>
          <option value="SIM">Sim</option>
        </select>
      </label>

      <label class="campo-pagamento">
        <span>💬 Observação</span>
        <textarea id="despesa-observacao" rows="3" maxlength="250" placeholder="Ex.: vence todo dia 10"></textarea>
      </label>

      <button id="btn-salvar-despesa" type="submit" class="botao-salvar-pagamento">💾 Salvar despesa</button>
      <button id="btn-cancelar-despesa" type="button" class="botao-cancelar-pagamento">Cancelar</button>
    </form>`;

  $('btn-cancelar-despesa').addEventListener('click',async()=>{
    subtelaModulo=null;
    c.innerHTML='<div class="carregando">Carregando...</div>';
    await renderFinanceiro(c);
    rolarModuloTopo();
  });

  $('form-nova-despesa').addEventListener('submit',async e=>{
    e.preventDefault();

    const botao=$('btn-salvar-despesa');
    const descricao=$('despesa-descricao').value.trim();
    const valor=Number($('despesa-valor').value||0);
    const categoria=$('despesa-categoria').value;
    const vencimento=$('despesa-vencimento').value;
    const refMes=$('despesa-referencia').value;
    const recorrente=$('despesa-recorrente').value;
    const observacao=$('despesa-observacao').value.trim();

    if(!descricao) return toast('Informe a descrição.');
    if(valor<=0) return toast('Informe um valor válido.');
    if(!categoria) return toast('Escolha uma categoria.');
    if(!vencimento) return toast('Informe o vencimento.');
    if(!refMes) return toast('Informe a referência.');

    const referencia=`${refMes.slice(5,7)}/${refMes.slice(0,4)}`;

    botao.disabled=true;
    botao.textContent='Salvando despesa...';

    try{
      const r=await chamarApi({
        action:'novoLancamento',
        token:sessao.token,
        dados:{
          tipo:'DESPESA',
          descricao,
          categoria,
          referencia,
          valor,
          vencimento,
          dataPagamento:'',
          formaPagamento:'',
          parcelaAtual:'',
          totalParcelas:'',
          grupoParcela:'',
          observacao,
          recorrente
        }
      });

      assertOk(r);

      toast(
        r.status==='ATRASADO'
          ? 'Despesa cadastrada como atrasada ⚠️'
          : 'Despesa cadastrada com sucesso ✅'
      );

      subtelaModulo=null;
      await renderFinanceiro(c);
      rolarModuloTopo();
    }catch(err){
      toast(err.message||'Erro ao cadastrar despesa.');
      botao.disabled=false;
      botao.textContent='💾 Salvar despesa';
    }
  });
}

async function renderNovaReceita(c){
  subtelaModulo='nova-receita';
  rolarModuloTopo();

  let categorias=['Salário','Férias','Bônus','Outros'];

  try{
    const r=await chamarApi({
      action:'listarConfig',
      token:sessao.token,
      tipo:'CATEGORIA_RECEITA'
    });
    assertOk(r);

    const configuradas=(r.dados||[])
      .map(x=>String(x.nome||'').trim())
      .filter(Boolean);

    if(configuradas.length) categorias=[...new Set(configuradas)];
  }catch(e){
    // Mantém categorias padrão para que o cadastro continue disponível.
  }

  const ref=referenciaAtual();
  const refInput=ref.split('/').reverse().join('-');

  c.innerHTML=
    cabecalho('💰','Nova receita','Cadastre uma entrada de dinheiro')+
    `<form id="form-nova-receita" class="form-pagamento form-nova-receita">

      <label class="campo-pagamento">
        <span>📝 Descrição *</span>
        <input id="receita-descricao" type="text" maxlength="120" placeholder="Ex.: Salário" required>
      </label>

      <label class="campo-pagamento">
        <span>💲 Valor *</span>
        <input id="receita-valor" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0,00" required>
      </label>

      <label class="campo-pagamento">
        <span>🏷️ Categoria *</span>
        <select id="receita-categoria" required>
          <option value="">Selecione uma categoria</option>
          ${categorias.map(x=>`<option value="${escAttr(x)}">${esc(x)}</option>`).join('')}
        </select>
      </label>

      <label class="campo-pagamento">
        <span>📅 Data prevista *</span>
        <input id="receita-vencimento" type="date" value="${dataInputHoje()}" required>
        <small class="ajuda-campo">A receita será criada como A RECEBER até você registrar o recebimento.</small>
      </label>

      <label class="campo-pagamento">
        <span>🗓️ Referência *</span>
        <input id="receita-referencia" type="month" value="${escAttr(refInput)}" required>
        <small class="ajuda-campo">É o mês ao qual esta receita pertence.</small>
      </label>

      <label class="campo-pagamento">
        <span>🔁 Recorrente</span>
        <select id="receita-recorrente">
          <option value="NÃO">Não</option>
          <option value="SIM">Sim</option>
        </select>
      </label>

      <label class="campo-pagamento">
        <span>💬 Observação</span>
        <textarea id="receita-observacao" rows="3" maxlength="250" placeholder="Ex.: pagamento mensal"></textarea>
      </label>

      <button id="btn-salvar-receita" type="submit" class="botao-salvar-pagamento">💾 Salvar receita</button>
      <button id="btn-cancelar-receita" type="button" class="botao-cancelar-pagamento">Cancelar</button>
    </form>`;

  $('btn-cancelar-receita').addEventListener('click',async()=>{
    subtelaModulo=null;
    c.innerHTML='<div class="carregando">Carregando...</div>';
    await renderFinanceiro(c);
    rolarModuloTopo();
  });

  $('form-nova-receita').addEventListener('submit',async e=>{
    e.preventDefault();

    const botao=$('btn-salvar-receita');
    const descricao=$('receita-descricao').value.trim();
    const valor=Number($('receita-valor').value||0);
    const categoria=$('receita-categoria').value;
    const vencimento=$('receita-vencimento').value;
    const refMes=$('receita-referencia').value;
    const recorrente=$('receita-recorrente').value;
    const observacao=$('receita-observacao').value.trim();

    if(!descricao) return toast('Informe a descrição.');
    if(valor<=0) return toast('Informe um valor válido.');
    if(!categoria) return toast('Escolha uma categoria.');
    if(!vencimento) return toast('Informe a data prevista.');
    if(!refMes) return toast('Informe a referência.');

    const referencia=`${refMes.slice(5,7)}/${refMes.slice(0,4)}`;

    botao.disabled=true;
    botao.textContent='Salvando receita...';

    try{
      const r=await chamarApi({
        action:'novoLancamento',
        token:sessao.token,
        dados:{
          tipo:'RECEITA',
          descricao,
          categoria,
          referencia,
          valor,
          vencimento,
          dataPagamento:'',
          formaPagamento:'',
          parcelaAtual:'',
          totalParcelas:'',
          grupoParcela:'',
          observacao,
          recorrente
        }
      });

      assertOk(r);
      toast('Receita cadastrada com sucesso ✅');
      subtelaModulo=null;
      await renderFinanceiro(c);
      rolarModuloTopo();
    }catch(err){
      toast(err.message||'Erro ao cadastrar receita.');
      botao.disabled=false;
      botao.textContent='💾 Salvar receita';
    }
  });
}

async function renderRegistrarPagamento(c,item){
  subtelaModulo='registrar-pagamento';
  rolarModuloTopo();

  const ehReceita=item.tipo==='RECEITA';
  const titulo=ehReceita?'Registrar recebimento':'Registrar pagamento';
  const subtitulo=ehReceita?'Preencha os dados do recebimento e anexe o comprovante':'Preencha os dados e anexe o comprovante';
  const verbo=ehReceita?'recebido':'pago';
  const venc=item.vencimento?dataBR(item.vencimento):'Sem data';
  const status=String(item.status||'').replaceAll('_',' ');
  const valor=Number(item.valor||0).toFixed(2);

  c.innerHTML=
    cabecalho(ehReceita?'💰':'🧾',titulo,subtitulo)+
    `<section class="conta-pagamento-resumo">
      <div>
        <strong>${esc(item.descricao||'Lançamento')}</strong>
        <span>${esc(item.categoria||'')} • ${esc(venc)}</span>
      </div>
      <div class="resumo-pagamento-direita">
        <strong>${moeda(item.valor)}</strong>
        <span class="badge ${String(item.status||'').toLowerCase().replaceAll('_','')}">${esc(status)}</span>
      </div>
    </section>

    <form id="form-registrar-pagamento" class="form-pagamento">
      <label class="campo-pagamento">
        <span>💲 Valor ${verbo} *</span>
        <input id="pagamento-valor" type="number" min="0.01" step="0.01" inputmode="decimal" value="${escAttr(valor)}" required>
      </label>

      <label class="campo-pagamento">
        <span>📅 Data do ${ehReceita?'recebimento':'pagamento'} *</span>
        <input id="pagamento-data" type="date" value="${dataInputHoje()}" required>
      </label>

      <div class="campo-pagamento">
        <span>💳 Forma ${ehReceita?'de recebimento':'de pagamento'} *</span>
        <input id="pagamento-forma" type="hidden" value="PIX">
        <div class="formas-pagamento">
          <button type="button" class="forma-pagamento ativo" data-forma="PIX">🔷 PIX</button>
          <button type="button" class="forma-pagamento" data-forma="CRÉDITO">💳 Crédito</button>
          <button type="button" class="forma-pagamento" data-forma="DÉBITO">🏦 Débito</button>
          <button type="button" class="forma-pagamento" data-forma="DINHEIRO">💵 Dinheiro</button>
        </div>
      </div>

      <label class="campo-pagamento">
        <span>💬 Observação</span>
        <textarea id="pagamento-observacao" rows="3" maxlength="250" placeholder="Ex.: ${ehReceita?'recebido via banco':'pago pelo app do banco'}"></textarea>
      </label>

      <div class="campo-pagamento campo-comprovante">
        <div class="linha-campo-comprovante">
          <span>📎 Anexar comprovante</span>
          <small>JPG, PNG ou PDF • máx. 10 MB</small>
        </div>
        <label class="seletor-arquivo">
          <input id="pagamento-arquivo" type="file" accept="image/jpeg,image/png,application/pdf">
          <strong>📎 Escolher arquivo</strong>
          <span id="nome-arquivo">Nenhum arquivo selecionado</span>
        </label>
      </div>

      <button id="btn-salvar-pagamento" type="submit" class="botao-salvar-pagamento">✅ Salvar ${ehReceita?'recebimento':'pagamento'}</button>
      <button id="btn-cancelar-pagamento" type="button" class="botao-cancelar-pagamento">Cancelar</button>
    </form>`;

  c.querySelectorAll('.forma-pagamento').forEach(btn=>{
    btn.addEventListener('click',()=>{
      c.querySelectorAll('.forma-pagamento').forEach(x=>x.classList.remove('ativo'));
      btn.classList.add('ativo');
      $('pagamento-forma').value=btn.dataset.forma;
    });
  });

  $('pagamento-arquivo').addEventListener('change',e=>{
    const file=e.target.files?.[0];
    $('nome-arquivo').textContent=file?`${file.name} • ${formatarBytes(file.size)}`:'Nenhum arquivo selecionado';
  });

  $('btn-cancelar-pagamento').addEventListener('click',async()=>{
    subtelaModulo=null;
    c.innerHTML='<div class="carregando">Carregando...</div>';
    await renderFinanceiro(c);
    rolarModuloTopo();
  });

  $('form-registrar-pagamento').addEventListener('submit',async e=>{
    e.preventDefault();

    const botao=$('btn-salvar-pagamento');
    const valorPago=Number($('pagamento-valor').value||0);
    const dataPagamento=$('pagamento-data').value;
    const formaPagamento=$('pagamento-forma').value;
    const observacao=$('pagamento-observacao').value.trim();
    const file=$('pagamento-arquivo').files?.[0]||null;

    if(valorPago<=0) return toast(`Informe um valor ${verbo} válido.`);
    if(!dataPagamento) return toast(`Informe a data do ${ehReceita?'recebimento':'pagamento'}.`);
    if(!formaPagamento) return toast(`Escolha a forma ${ehReceita?'de recebimento':'de pagamento'}.`);

    botao.disabled=true;
    botao.textContent=file?'Enviando comprovante...':'Salvando...';

    try{
      const payload={
        action:'registrarPagamento',
        token:sessao.token,
        id:item.id,
        dados:{
          valorPago,
          dataPagamento,
          formaPagamento,
          observacao
        }
      };

      if(file){
        payload.arquivo=await arquivoParaPayload(file);
      }

      botao.textContent=`Salvando ${ehReceita?'recebimento':'pagamento'}...`;
      const r=await chamarApi(payload);
      assertOk(r);

      toast(`${ehReceita?'Recebimento':'Pagamento'} registrado com sucesso ✅`);
      subtelaModulo=null;
      await renderFinanceiro(c);
      rolarModuloTopo();
    }catch(err){
      toast(err.message||`Erro ao registrar ${ehReceita?'recebimento':'pagamento'}.`);
      botao.disabled=false;
      botao.textContent=`✅ Salvar ${ehReceita?'recebimento':'pagamento'}`;
    }
  });
}


/* =========================================================
   MERCADO
========================================================= */

async function renderMercado(c){
  subtelaModulo=null;
  const r=await chamarApi({action:'listarMercado',token:sessao.token,referencia:referenciaAtual()});
  assertOk(r);
  const itens=r.dados||[];
  c.innerHTML=cabecalho('🛒','Mercado','Lista de compras e registros')+`<div class="painel"><div class="painel-titulo"><h3>Minha lista de compras</h3><span>${itens.length} itens</span></div><div class="lista-modulo">${itens.length?itens.map(itemMercado).join(''):'<div class="vazio">Sua lista está vazia. Você pode preencher a aba MERCADO na planilha.</div>'}</div></div>`;
  c.querySelectorAll('[data-mercado-id]').forEach(btn=>btn.addEventListener('click',async()=>{
    btn.disabled=true;
    try{
      const novo=btn.dataset.ok!=='SIM';
      const rr=await chamarApi({action:'atualizarItemMercado',token:sessao.token,id:btn.dataset.mercadoId,dados:{comprado:novo?'SIM':'NÃO'}});
      assertOk(rr);
      await renderMercado(c);
    }catch(e){
      toast(e.message);
    }finally{
      btn.disabled=false;
    }
  }));
}

function itemMercado(x){
  const ok=String(x.comprado).toUpperCase()==='SIM';
  return `<div class="item-lista"><div><div class="descricao">${esc(x.produto)}</div><div class="meta">${esc(x.categoria||'')} • ${esc(String(x.quantidade||''))} ${esc(x.unidade||'')}</div></div><button class="check-mercado ${ok?'ok':''}" data-mercado-id="${esc(x.id)}" data-ok="${ok?'SIM':'NÃO'}">${ok?'✓':''}</button></div>`;
}

/* =========================================================
   CASA
========================================================= */

async function renderCasa(c){
  subtelaModulo=null;

  const hoje=dataInputHoje();
  const fim=dataInputOffset(14);

  const r=await chamarApi({
    action:'listarTarefasCasa',
    token:sessao.token,
    inicio:hoje,
    fim
  });
  assertOk(r);

  const tarefas=(r.dados||[]).sort((a,b)=>{
    const da=new Date(a.dataPrevista||0).getTime();
    const db=new Date(b.dataPrevista||0).getTime();
    if(da!==db) return da-db;
    return String(a.tarefa||'').localeCompare(String(b.tarefa||''),'pt-BR');
  });

  const hojeTarefas=tarefas.filter(x=>String(x.dataPrevista||'').slice(0,10)===hoje);
  const proximas=tarefas.filter(x=>String(x.dataPrevista||'').slice(0,10)>hoje);
  const pendentes=tarefas.filter(x=>String(x.status||'').toUpperCase()==='PENDENTE').length;

  c.innerHTML=
    `<div class="cabecalho-casa">
      ${cabecalho('🏠','Casa','Rotinas, tarefas e limpeza')}
      <button id="btn-nova-tarefa-casa" type="button" class="botao-nova-tarefa-casa">＋ Tarefa</button>
    </div>`+
    `<div class="cards-resumo cards-resumo-casa">
      <div class="card-resumo"><small>Hoje</small><strong class="laranja">${hojeTarefas.length}</strong></div>
      <div class="card-resumo"><small>Pendentes</small><strong class="amarelo">${pendentes}</strong></div>
    </div>`+
    `<div class="painel">
      <div class="painel-titulo"><h3>📅 Hoje</h3><span>${hojeTarefas.length}</span></div>
      <div class="lista-modulo">
        ${hojeTarefas.length?hojeTarefas.map(x=>itemTarefaCasa(x,false)).join(''):'<div class="vazio">Nenhuma tarefa para hoje. 🎉</div>'}
      </div>
    </div>`+
    `<div class="painel">
      <div class="painel-titulo"><h3>🗓️ Próximos 14 dias</h3><span>${proximas.length}</span></div>
      <div class="lista-modulo">
        ${proximas.length?proximas.map(x=>itemTarefaCasa(x,true)).join(''):'<div class="vazio">Nenhuma tarefa próxima cadastrada.</div>'}
      </div>
    </div>`;

  $('btn-nova-tarefa-casa').addEventListener('click',async()=>{
    await renderNovaTarefaCasa(c);
  });

  c.querySelectorAll('[data-concluir-tarefa]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      const id=btn.dataset.concluirTarefa;
      btn.disabled=true;
      try{
        const rr=await chamarApi({
          action:'concluirTarefaCasa',
          token:sessao.token,
          id,
          concluidaPor:sessao.usuario?.nome||''
        });
        assertOk(rr);
        toast('Tarefa concluída! ✅');
        await renderCasa(c);
      }catch(e){
        toast(e.message||'Não foi possível concluir a tarefa.');
        btn.disabled=false;
      }
    });
  });
}

function itemTarefaCasa(x,mostrarData){
  const status=String(x.status||'PENDENTE').toUpperCase();
  const classe=status.toLowerCase();
  const data=mostrarData&&x.dataPrevista?`<span class="data-tarefa-casa">${dataBR(x.dataPrevista)}</span>`:'';
  const botao=status==='PENDENTE'
    ?`<button class="botao-concluir-tarefa" data-concluir-tarefa="${escAttr(x.id)}">✓ Concluir</button>`
    :'';

  return `<div class="item-lista item-tarefa-casa">
    <div class="info-tarefa-casa">
      <div class="descricao">${esc(x.tarefa||'Sem descrição')}</div>
      <div class="meta">${esc(x.responsavel||'Ambos')}${data?' • '+data:''}</div>
      ${x.observacao?`<div class="observacao-tarefa-casa">${esc(x.observacao)}</div>`:''}
      <span class="badge badge-casa ${classe}">${esc(status.replaceAll('_',' '))}</span>
    </div>
    <div class="lado-tarefa-casa">${botao}</div>
  </div>`;
}

async function renderNovaTarefaCasa(c){
  subtelaModulo='nova-tarefa-casa';
  rolarModuloTopo();

  const nomeUsuario=sessao.usuario?.nome||'';
  const responsavelPadrao=['Fernando','Letícia'].includes(nomeUsuario)?nomeUsuario:'Ambos';

  c.innerHTML=
    cabecalho('➕','Nova tarefa','Adicione uma tarefa manual para a casa')+
    `<form id="form-nova-tarefa-casa" class="form-pagamento form-nova-tarefa-casa">
      <label class="campo-pagamento">
        <span>📝 Tarefa *</span>
        <input id="casa-tarefa" type="text" maxlength="120" placeholder="Ex.: Lavar as roupas" required>
      </label>

      <label class="campo-pagamento">
        <span>📅 Data *</span>
        <input id="casa-data" type="date" value="${dataInputHoje()}" required>
      </label>

      <label class="campo-pagamento">
        <span>👤 Responsável *</span>
        <select id="casa-responsavel" required>
          <option value="Fernando" ${responsavelPadrao==='Fernando'?'selected':''}>Fernando</option>
          <option value="Letícia" ${responsavelPadrao==='Letícia'?'selected':''}>Letícia</option>
          <option value="Ambos" ${responsavelPadrao==='Ambos'?'selected':''}>Ambos</option>
        </select>
      </label>

      <label class="campo-pagamento">
        <span>💬 Observação</span>
        <textarea id="casa-observacao" maxlength="300" placeholder="Algum detalhe da tarefa?"></textarea>
      </label>

      <button id="btn-salvar-tarefa-casa" type="submit" class="botao-salvar-pagamento">✅ Inserir tarefa</button>
      <button id="btn-cancelar-tarefa-casa" type="button" class="botao-cancelar-pagamento">Cancelar</button>
    </form>`;

  $('btn-cancelar-tarefa-casa').addEventListener('click',async()=>{
    await renderCasa(c);
  });

  $('form-nova-tarefa-casa').addEventListener('submit',async e=>{
    e.preventDefault();

    const botao=$('btn-salvar-tarefa-casa');
    botao.disabled=true;
    botao.textContent='Salvando...';

    try{
      const r=await chamarApi({
        action:'inserirTarefaCasa',
        token:sessao.token,
        dados:{
          tarefa:$('casa-tarefa').value.trim(),
          dataPrevista:$('casa-data').value,
          responsavel:$('casa-responsavel').value,
          observacao:$('casa-observacao').value.trim()
        }
      });
      assertOk(r);
      toast('Tarefa inserida com sucesso! 🏠');
      await renderCasa(c);
      rolarModuloTopo();
    }catch(err){
      toast(err.message||'Não foi possível inserir a tarefa.');
      botao.disabled=false;
      botao.textContent='✅ Inserir tarefa';
    }
  });
}

/* =========================================================
   COMPRAS PLANEJADAS
========================================================= */

async function renderComprasPlanejadas(c, filtroInicial='TODAS', buscaInicial='', ordemInicial='RECENTES'){
  subtelaModulo=null;

  const r=await chamarApi({
    action:'listarComprasPlanejadas',
    token:sessao.token
  });
  assertOk(r);

  const itens=r.dados||[];
  renderListaComprasPlanejadas(c,itens,filtroInicial,buscaInicial,ordemInicial);
}

function resumoComprasPlanejadas(itens){
  const ativas=itens.filter(x=>!['COMPRADA','DESISTIMOS'].includes(String(x.status||'').toUpperCase()));
  const compradas=itens.filter(x=>String(x.status||'').toUpperCase()==='COMPRADA');
  const total=ativas.reduce((s,x)=>s+Number(x.preco||0),0);
  return {ativas,compradas,total};
}

function filtrarOrdenarComprasPlanejadas(itens,filtro='TODAS',busca='',ordem='RECENTES'){
  const termo=String(busca||'').trim().toLowerCase();
  let lista=filtro==='TODAS'
    ? [...itens]
    : itens.filter(x=>String(x.status||'').toUpperCase()===filtro);

  if(termo){
    lista=lista.filter(x=>[
      x.nome,x.loja,x.categoria,x.descricao,x.observacao
    ].some(v=>String(v||'').toLowerCase().includes(termo)));
  }

  const statusOrdem={DESEJADA:1,PESQUISANDO:2,AGUARDANDO:3,COMPRADA:4,DESISTIMOS:5};
  lista.sort((a,b)=>{
    if(ordem==='MENOR_PRECO') return Number(a.preco||0)-Number(b.preco||0);
    if(ordem==='MAIOR_PRECO') return Number(b.preco||0)-Number(a.preco||0);
    if(ordem==='NOME_AZ') return String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR');
    if(ordem==='NOME_ZA') return String(b.nome||'').localeCompare(String(a.nome||''),'pt-BR');
    if(ordem==='STATUS') return (statusOrdem[String(a.status||'').toUpperCase()]||99)-(statusOrdem[String(b.status||'').toUpperCase()]||99);

    const da=new Date(a.criadoEm||a.atualizadoEm||0).getTime()||0;
    const db=new Date(b.criadoEm||b.atualizadoEm||0).getTime()||0;
    return db-da;
  });

  return lista;
}

function resumoCategoriasCompras(itens){
  const mapa={};
  itens
    .filter(x=>!['COMPRADA','DESISTIMOS'].includes(String(x.status||'').toUpperCase()))
    .forEach(x=>{
      const cat=String(x.categoria||'Outros');
      if(!mapa[cat]) mapa[cat]={categoria:cat,quantidade:0,total:0};
      mapa[cat].quantidade++;
      mapa[cat].total+=Number(x.preco||0);
    });

  return Object.values(mapa).sort((a,b)=>b.total-a.total);
}

function renderListaComprasPlanejadas(c,itens,filtro='TODAS',busca='',ordem='RECENTES'){
  const resumo=resumoComprasPlanejadas(itens);
  const itensFiltrados=filtrarOrdenarComprasPlanejadas(itens,filtro,busca,ordem);
  const categorias=resumoCategoriasCompras(itens);

  c.innerHTML=
    `<div class="cabecalho-compras-planejadas">
      ${cabecalho('🛍️','Compras Planejadas','Coisas que queremos comprar depois')}
      <button id="btn-nova-compra-planejada" type="button" class="botao-nova-compra-planejada">＋ Compra</button>
    </div>`+
    `<div class="cards-resumo cards-resumo-compras">
      <div class="card-resumo"><small>Planejadas</small><strong class="laranja">${resumo.ativas.length}</strong></div>
      <div class="card-resumo"><small>Total planejado</small><strong class="laranja">${moeda(resumo.total)}</strong></div>
      <div class="card-resumo"><small>Compradas</small><strong class="verde">${resumo.compradas.length}</strong></div>
    </div>`+
    `<div class="painel painel-categorias-compras">
      <div class="painel-titulo"><h3>💰 Total por categoria</h3><span>ativas</span></div>
      <div class="categorias-compras-grid">
        ${categorias.length?categorias.map(x=>`<div class="categoria-compra-resumo"><strong>${esc(x.categoria)}</strong><span>${x.quantidade} ${x.quantidade===1?'item':'itens'}</span><b>${moeda(x.total)}</b></div>`).join(''):'<div class="vazio">Nenhuma compra planejada ativa.</div>'}
      </div>
    </div>`+
    `<div class="controles-compras-planejadas">
      <label class="campo-busca-compras">
        <span>🔎</span>
        <input id="busca-compras-planejadas" type="search" value="${escAttr(busca)}" placeholder="Buscar produto, loja ou categoria..." autocomplete="off">
      </label>
      <select id="ordem-compras-planejadas" aria-label="Ordenar compras">
        <option value="RECENTES" ${ordem==='RECENTES'?'selected':''}>Mais recentes</option>
        <option value="MENOR_PRECO" ${ordem==='MENOR_PRECO'?'selected':''}>Menor preço</option>
        <option value="MAIOR_PRECO" ${ordem==='MAIOR_PRECO'?'selected':''}>Maior preço</option>
        <option value="NOME_AZ" ${ordem==='NOME_AZ'?'selected':''}>Nome A–Z</option>
        <option value="NOME_ZA" ${ordem==='NOME_ZA'?'selected':''}>Nome Z–A</option>
        <option value="STATUS" ${ordem==='STATUS'?'selected':''}>Por status</option>
      </select>
    </div>`+
    `<div class="barra-filtros-compras">
      ${chipCompra('TODAS','Todas',filtro)}
      ${chipCompra('DESEJADA','Quero comprar',filtro)}
      ${chipCompra('PESQUISANDO','Pesquisando',filtro)}
      ${chipCompra('AGUARDANDO','Aguardando',filtro)}
      ${chipCompra('COMPRADA','Compradas',filtro)}
      ${chipCompra('DESISTIMOS','Desistimos',filtro)}
    </div>`+
    `<div class="cabecalho-lista-compras">
      <strong>${esc(rotuloFiltroCompra(filtro))}</strong>
      <span>${itensFiltrados.length} ${itensFiltrados.length===1?'item':'itens'}</span>
    </div>`+
    `<div id="lista-compras-planejadas" class="lista-compras-planejadas">
      ${itensFiltrados.length?itensFiltrados.map(itemCompraPlanejada).join(''):'<div class="painel vazio">Nenhum item encontrado.<br>Adicione uma compra ou altere a busca/filtro. 🛍️</div>'}
    </div>`;

  $('btn-nova-compra-planejada').addEventListener('click',async()=>{
    await renderNovaCompraPlanejada(c);
  });

  const buscaEl=$('busca-compras-planejadas');
  let timerBusca;
  buscaEl.addEventListener('input',()=>{
    clearTimeout(timerBusca);
    const valor=buscaEl.value;
    const pos=buscaEl.selectionStart ?? valor.length;
    timerBusca=setTimeout(()=>{
      const ordemAtual=$('ordem-compras-planejadas')?.value||ordem;
      renderListaComprasPlanejadas(c,itens,filtro,valor,ordemAtual);
      const novoCampo=$('busca-compras-planejadas');
      if(novoCampo){
        novoCampo.focus();
        try{novoCampo.setSelectionRange(pos,pos);}catch(e){}
      }
    },180);
  });

  $('ordem-compras-planejadas').addEventListener('change',()=>{
    renderListaComprasPlanejadas(c,itens,filtro,buscaEl.value,$('ordem-compras-planejadas').value);
  });

  c.querySelectorAll('[data-filtro-compra]').forEach(btn=>{
    btn.addEventListener('click',()=>renderListaComprasPlanejadas(c,itens,btn.dataset.filtroCompra,buscaEl.value,$('ordem-compras-planejadas').value));
  });

  ligarStatusComprasPlanejadas(c,filtro,busca,ordem);

  c.querySelectorAll('[data-editar-compra]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const item=itens.find(x=>String(x.id)===String(btn.dataset.editarCompra));
      if(item) renderEditarCompraPlanejada(c,item);
    });
  });

  c.querySelectorAll('[data-excluir-compra]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      const item=itens.find(x=>String(x.id)===String(btn.dataset.excluirCompra));
      if(!item) return;
      const confirma=window.confirm(`Excluir "${item.nome||'esta compra'}" da lista?\n\nEssa ação não pode ser desfeita.`);
      if(!confirma) return;
      btn.disabled=true;
      try{
        const rr=await chamarApi({
          action:'excluirCompraPlanejada',
          token:sessao.token,
          id:item.id
        });
        assertOk(rr);
        toast('Compra excluída. 🗑️');
        await renderComprasPlanejadas(c,filtro,busca,ordem);
      }catch(e){
        toast(e.message||'Não foi possível excluir.');
        btn.disabled=false;
      }
    });
  });
}

function rotuloFiltroCompra(filtro){
  return ({
    TODAS:'Todas as compras',
    DESEJADA:'Quero comprar',
    PESQUISANDO:'Em pesquisa',
    AGUARDANDO:'Aguardando oportunidade',
    COMPRADA:'Compradas',
    DESISTIMOS:'Desistimos'
  })[filtro]||'Compras';
}

function ligarStatusComprasPlanejadas(c,filtro,busca='',ordem='RECENTES'){
  c.querySelectorAll('[data-status-compra]').forEach(sel=>{
    sel.addEventListener('change',async()=>{
      sel.disabled=true;
      try{
        const rr=await chamarApi({
          action:'atualizarStatusCompraPlanejada',
          token:sessao.token,
          id:sel.dataset.statusCompra,
          status:sel.value
        });
        assertOk(rr);
        toast('Status atualizado! ✅');
        await renderComprasPlanejadas(c,filtro,busca,ordem);
      }catch(e){
        toast(e.message||'Não foi possível atualizar.');
        sel.disabled=false;
      }
    });
  });
}

function chipCompra(valor,label,atual){
  return `<button type="button" class="chip chip-compra ${valor===atual?'ativo':''}" data-filtro-compra="${escAttr(valor)}">${esc(label)}</button>`;
}

function itemCompraPlanejada(x){
  const status=String(x.status||'DESEJADA').toUpperCase();
  const imagem=x.imagemUrl
    ? `<a class="imagem-link-compra" href="${escAttr(x.link)}" target="_blank" rel="noopener noreferrer"><img class="imagem-compra-planejada" src="${escAttr(x.imagemUrl)}" alt="" loading="lazy" onerror="this.style.display='none'" /></a>`
    : '<a class="imagem-link-compra" href="'+escAttr(x.link)+'" target="_blank" rel="noopener noreferrer"><div class="imagem-compra-planejada sem-imagem">🛍️</div></a>';
  const descricao=x.descricao?`<div class="descricao-compra-planejada">${esc(x.descricao)}</div>`:'';
  const preco=Number(x.preco||0)>0?moeda(x.preco):'Preço não informado';
  const categoria=x.categoria?`<span>🏷️ ${esc(x.categoria)}</span>`:'';
  const loja=x.loja?`<span>🏪 ${esc(x.loja)}</span>`:'<span>🏪 Loja não identificada</span>';

  return `<article class="card-compra-planejada ${status.toLowerCase()}">
    ${imagem}
    <div class="conteudo-compra-planejada">
      <div class="topo-card-compra">
        <div class="titulo-compra-wrap">
          <h3>${esc(x.nome||'Produto')}</h3>
          <div class="meta-compra-planejada">${loja}${categoria?` <b>•</b> ${categoria}`:''}</div>
        </div>
        <strong class="preco-compra-planejada">${esc(preco)}</strong>
      </div>
      ${descricao}
      <div class="linha-status-compra">
        <span class="badge-compra ${status.toLowerCase()}">${esc(formatarStatusCompra(status))}</span>
        <select class="select-status-compra" data-status-compra="${escAttr(x.id)}" aria-label="Status da compra">
          ${statusOptionsCompra(status)}
        </select>
      </div>
      ${x.observacao?`<div class="observacao-compra-planejada">💬 ${esc(x.observacao)}</div>`:''}
      <div class="acoes-compra-planejada">
        <a class="botao-link-compra" href="${escAttr(x.link)}" target="_blank" rel="noopener noreferrer">🔗 Ver produto</a>
        <button type="button" class="botao-editar-compra" data-editar-compra="${escAttr(x.id)}">✏️ Editar</button>
        <button type="button" class="botao-excluir-compra" data-excluir-compra="${escAttr(x.id)}">🗑️</button>
      </div>
    </div>
  </article>`;
}

function statusOptionsCompra(atual){
  const op=[
    ['DESEJADA','Quero comprar'],
    ['PESQUISANDO','Pesquisando'],
    ['AGUARDANDO','Aguardando oportunidade'],
    ['COMPRADA','Comprada'],
    ['DESISTIMOS','Desistimos']
  ];
  return op.map(([v,t])=>`<option value="${v}" ${v===atual?'selected':''}>${t}</option>`).join('');
}

function formatarStatusCompra(status){
  return ({
    DESEJADA:'Quero comprar',
    PESQUISANDO:'Pesquisando',
    AGUARDANDO:'Aguardando',
    COMPRADA:'Comprada',
    DESISTIMOS:'Desistimos'
  })[status]||status;
}

async function renderNovaCompraPlanejada(c){
  subtelaModulo='nova-compra-planejada';
  let ultimoLinkBusca='';
  rolarModuloTopo();

  const categorias=['Casa','Vestuário','Cama, mesa e banho','Cozinha','Eletrônicos','Ferramentas','Outros'];

  c.innerHTML=
    cabecalho('🛍️','Adicionar compra','Cole o link e tente buscar os dados automaticamente')+
    `<form id="form-nova-compra-planejada" class="form-pagamento form-nova-compra-planejada" autocomplete="off">
      <label class="campo-pagamento">
        <span>🔗 Link do produto *</span>
        <div class="campo-link-produto">
          <input id="compra-link" type="url" maxlength="2000" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="https://loja.com/produto..." required>
          <button id="btn-buscar-produto" type="button" class="botao-buscar-produto">Buscar</button>
        </div>
        <small class="ajuda-campo">O LeFe Home tenta encontrar nome, preço, loja e imagem.</small>
      </label>

      <div id="aviso-busca-produto" class="aviso-busca-produto escondido"></div>

      <label class="campo-pagamento"><span>📝 Nome do produto *</span><input id="compra-nome" type="text" maxlength="180" autocomplete="off" placeholder="Ex.: Jogo de cama casal" required></label>
      <label class="campo-pagamento"><span>💰 Preço</span><input id="compra-preco" type="number" min="0" step="0.01" inputmode="decimal" autocomplete="off" placeholder="0,00"></label>
      <label class="campo-pagamento"><span>🏪 Loja</span><input id="compra-loja" type="text" maxlength="120" autocomplete="off" placeholder="Ex.: Mercado Livre"></label>
      <label class="campo-pagamento"><span>🏷️ Categoria</span><select id="compra-categoria">${categorias.map(x=>`<option value="${escAttr(x)}">${esc(x)}</option>`).join('')}</select></label>
      <label class="campo-pagamento"><span>💬 Descrição</span><textarea id="compra-descricao" maxlength="500" autocomplete="off" rows="3" placeholder="Descrição encontrada no produto ou escrita por vocês."></textarea></label>
      <label class="campo-pagamento"><span>📌 Status</span><select id="compra-status">${statusOptionsCompra('DESEJADA')}</select></label>
      <label class="campo-pagamento"><span>💬 Observação</span><textarea id="compra-observacao" maxlength="500" autocomplete="off" rows="3" placeholder="Ex.: esperar promoção ou comparar com outra loja."></textarea></label>
      <input id="compra-imagem" type="hidden">
      <button id="btn-salvar-compra-planejada" type="submit" class="botao-salvar-pagamento">🛍️ Adicionar à lista</button>
      <button id="btn-cancelar-compra-planejada" type="button" class="botao-cancelar-pagamento">Cancelar</button>
    </form>`;

  $('btn-cancelar-compra-planejada').addEventListener('click',async()=>renderComprasPlanejadas(c));
  ligarBuscaProdutoCompraPlanejada({modo:'novo'});

  $('form-nova-compra-planejada').addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=$('btn-salvar-compra-planejada');
    const link=$('compra-link').value.trim();
    const nome=$('compra-nome').value.trim();
    const preco=Number($('compra-preco').value||0);
    if(!link) return toast('Informe o link do produto.');
    if(!nome) return toast('Informe o nome do produto.');
    btn.disabled=true; btn.textContent='Salvando...';
    try{
      const r=await chamarApi({action:'inserirCompraPlanejada',token:sessao.token,dados:{link,nome,descricao:$('compra-descricao').value.trim(),preco,loja:$('compra-loja').value.trim(),categoria:$('compra-categoria').value,status:$('compra-status').value,imagemUrl:$('compra-imagem').value.trim(),observacao:$('compra-observacao').value.trim()}});
      assertOk(r);
      toast('Compra adicionada à lista! 🛍️');
      await renderComprasPlanejadas(c);
      rolarModuloTopo();
    }catch(err){
      toast(err.message||'Não foi possível adicionar a compra.');
      btn.disabled=false; btn.textContent='🛍️ Adicionar à lista';
    }
  });
}

function ligarBuscaProdutoCompraPlanejada({modo='novo'}={}){
  let ultimoLinkBusca=$('compra-link')?.value.trim()||'';
  const linkInput=$('compra-link');
  const aviso=$('aviso-busca-produto');
  const btn=$('btn-buscar-produto');
  if(!linkInput||!btn) return;

  linkInput.addEventListener('input',()=>{
    const atual=linkInput.value.trim();
    if(ultimoLinkBusca && atual!==ultimoLinkBusca){
      $('compra-nome').value='';
      $('compra-preco').value='';
      $('compra-loja').value='';
      $('compra-descricao').value='';
      $('compra-imagem').value='';
      aviso.classList.add('escondido');
      ultimoLinkBusca='';
    }
  });

  btn.addEventListener('click',async()=>{
    const link=linkInput.value.trim();
    if(!link) return toast('Cole primeiro o link do produto.');

    $('compra-nome').value='';
    $('compra-preco').value='';
    $('compra-loja').value='';
    $('compra-descricao').value='';
    $('compra-imagem').value='';
    btn.disabled=true; btn.textContent='Buscando...';
    aviso.classList.remove('escondido'); aviso.textContent='🔎 Lendo os dados da página...';
    try{
      const r=await chamarApi({action:'buscarProdutoLink',token:sessao.token,link});
      assertOk(r);
      const d=r.dados||{};
      if(d.nome) $('compra-nome').value=d.nome;
      if(Number(d.preco||0)>0) $('compra-preco').value=Number(d.preco).toFixed(2);
      if(d.loja) $('compra-loja').value=d.loja;
      if(d.descricao) $('compra-descricao').value=d.descricao;
      if(d.imagemUrl) $('compra-imagem').value=d.imagemUrl;
      ultimoLinkBusca=link;
      aviso.textContent=r.aviso||'✅ Dados encontrados. Confira antes de salvar.';
    }catch(e){
      ultimoLinkBusca='';
      aviso.textContent='⚠️ Não foi possível buscar automaticamente. Você pode preencher os campos manualmente.';
      toast(e.message||'Não foi possível ler esse link.');
    }finally{
      btn.disabled=false; btn.textContent='Buscar';
    }
  });
}

async function renderEditarCompraPlanejada(c,item){
  subtelaModulo='editar-compra-planejada';
  rolarModuloTopo();
  const categorias=['Casa','Vestuário','Cama, mesa e banho','Cozinha','Eletrônicos','Ferramentas','Outros'];

  c.innerHTML=
    cabecalho('✏️','Editar compra','Atualize os dados desta compra planejada')+
    `<form id="form-editar-compra-planejada" class="form-pagamento form-nova-compra-planejada" autocomplete="off">
      <div class="identificador-edicao">ID: <strong>${esc(item.id)}</strong></div>
      <label class="campo-pagamento"><span>🔗 Link do produto *</span><div class="campo-link-produto"><input id="compra-link" type="url" maxlength="2000" value="${escAttr(item.link||'')}" autocomplete="off" autocapitalize="none" spellcheck="false" required><button id="btn-buscar-produto" type="button" class="botao-buscar-produto">Buscar</button></div></label>
      <div id="aviso-busca-produto" class="aviso-busca-produto escondido"></div>
      <label class="campo-pagamento"><span>📝 Nome do produto *</span><input id="compra-nome" type="text" maxlength="180" value="${escAttr(item.nome||'')}" required></label>
      <label class="campo-pagamento"><span>💰 Preço</span><input id="compra-preco" type="number" min="0" step="0.01" inputmode="decimal" value="${Number(item.preco||0)>0?Number(item.preco).toFixed(2):''}"></label>
      <label class="campo-pagamento"><span>🏪 Loja</span><input id="compra-loja" type="text" maxlength="120" value="${escAttr(item.loja||'')}"></label>
      <label class="campo-pagamento"><span>🏷️ Categoria</span><select id="compra-categoria">${categorias.map(x=>`<option value="${escAttr(x)}" ${x===item.categoria?'selected':''}>${esc(x)}</option>`).join('')}</select></label>
      <label class="campo-pagamento"><span>💬 Descrição</span><textarea id="compra-descricao" maxlength="500" rows="3">${esc(item.descricao||'')}</textarea></label>
      <label class="campo-pagamento"><span>📌 Status</span><select id="compra-status">${statusOptionsCompra(String(item.status||'DESEJADA').toUpperCase())}</select></label>
      <label class="campo-pagamento"><span>💬 Observação</span><textarea id="compra-observacao" maxlength="500" rows="3">${esc(item.observacao||'')}</textarea></label>
      <input id="compra-imagem" type="hidden" value="${escAttr(item.imagemUrl||'')}">
      <button id="btn-salvar-compra-planejada" type="submit" class="botao-salvar-pagamento">💾 Salvar alterações</button>
      <button id="btn-cancelar-compra-planejada" type="button" class="botao-cancelar-pagamento">Cancelar</button>
    </form>`;

  $('btn-cancelar-compra-planejada').addEventListener('click',async()=>renderComprasPlanejadas(c));
  ligarBuscaProdutoCompraPlanejada({modo:'editar'});

  $('form-editar-compra-planejada').addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=$('btn-salvar-compra-planejada');
    const nome=$('compra-nome').value.trim();
    if(!nome) return toast('Informe o nome do produto.');
    btn.disabled=true; btn.textContent='Salvando...';
    try{
      const r=await chamarApi({action:'atualizarCompraPlanejada',token:sessao.token,id:item.id,dados:{link:$('compra-link').value.trim(),nome,descricao:$('compra-descricao').value.trim(),preco:Number($('compra-preco').value||0),loja:$('compra-loja').value.trim(),categoria:$('compra-categoria').value,status:$('compra-status').value,imagemUrl:$('compra-imagem').value.trim(),observacao:$('compra-observacao').value.trim()}});
      assertOk(r);
      toast('Compra atualizada! ✅');
      await renderComprasPlanejadas(c);
      rolarModuloTopo();
    }catch(err){
      toast(err.message||'Não foi possível atualizar a compra.');
      btn.disabled=false; btn.textContent='💾 Salvar alterações';
    }
  });
}

/* =========================================================
   RELATÓRIOS / CALENDÁRIO / COMPROVANTES / CONFIG
========================================================= */

async function renderRelatorios(c){
  subtelaModulo=null;
  const ref=referenciaAtual();
  const r=await chamarApi({action:'resumoFinanceiro',token:sessao.token,referencia:ref});
  assertOk(r);
  const d=r.dados;
  const max=Math.max(d.entradas,d.saidas,1);
  c.innerHTML=cabecalho('📊','Relatórios','Resumo da vida financeira no mês')+`<div class="cards-resumo"><div class="card-resumo"><small>Entradas</small><strong class="verde">${moeda(d.entradas)}</strong></div><div class="card-resumo"><small>Saídas</small><strong class="vermelho">${moeda(d.saidas)}</strong></div><div class="card-resumo"><small>Saldo</small><strong class="${d.saldo>=0?'verde':'vermelho'}">${moeda(d.saldo)}</strong></div><div class="card-resumo"><small>A pagar</small><strong class="amarelo">${moeda(d.aPagar)}</strong></div></div><div class="painel"><div class="painel-titulo"><h3>Comparativo do mês</h3></div><div class="grafico-barras"><div class="barra" style="height:${Math.max(10,d.entradas/max*100)}%"><span>Entradas</span></div><div class="barra" style="height:${Math.max(10,d.saidas/max*100)}%;background:#a54b17"><span>Saídas</span></div></div></div>`;
}

async function renderCalendario(c){
  subtelaModulo=null;
  const r=await chamarApi({action:'listarFinanceiro',token:sessao.token,referencia:referenciaAtual()});
  assertOk(r);
  const itens=(r.dados||[]).filter(x=>x.tipo==='DESPESA'&&x.vencimento).sort((a,b)=>new Date(a.vencimento)-new Date(b.vencimento));
  c.innerHTML=cabecalho('📅','Calendário','Vencimentos e contas futuras')+`<div class="painel"><div class="painel-titulo"><h3>Vencimentos do mês</h3><span>${itens.length}</span></div><div class="lista-modulo">${itens.length?itens.map(itemFinanceiro).join(''):'<div class="vazio">Nenhum vencimento cadastrado.</div>'}</div></div>`;
}

async function renderComprovantes(c){
  subtelaModulo=null;
  const r=await chamarApi({action:'listarComprovantes',token:sessao.token,referencia:referenciaAtual()});
  assertOk(r);
  const itens=r.dados||[];
  c.innerHTML=cabecalho('🧾','Comprovantes','Arquivos salvos no Drive')+`<div class="painel"><div class="painel-titulo"><h3>Comprovantes</h3><span>${itens.length}</span></div><div class="lista-modulo">${itens.length?itens.map(x=>`<div class="item-lista"><div><div class="descricao">${esc(x.descricao)}</div><div class="meta">${esc(x.origem)}${x.data?' • '+dataBR(x.data):''}</div></div><a class="link-comprovante" href="${escAttr(x.url)}" target="_blank" rel="noopener">Abrir</a></div>`).join(''):'<div class="vazio">Nenhum comprovante salvo neste mês.</div>'}</div></div>`;
}

async function renderConfiguracoes(c){
  subtelaModulo=null;
  const r=await chamarApi({action:'listarConfig',token:sessao.token});
  assertOk(r);
  const dados=r.dados||[];
  const grupos={};
  dados.forEach(x=>(grupos[x.tipo]??=[]).push(x));
  c.innerHTML=cabecalho('⚙️','Configurações','Categorias, pagamentos e preferências')+Object.entries(grupos).map(([tipo,itens])=>`<div class="painel grupo-config"><h3>${tituloTipo(tipo)}</h3>${itens.map(x=>`<div class="config-linha"><strong>${esc(x.nome)}</strong>${x.valor?`<div class="meta">${esc(String(x.valor))}</div>`:''}</div>`).join('')}</div>`).join('');
}

/* =========================================================
   HELPERS
========================================================= */

function cabecalho(i,t,s){
  return `<section class="cabecalho-modulo"><div class="icone-grande">${i}</div><div><h2>${esc(t)}</h2><p>${esc(s)}</p></div></section>`;
}

function referenciaAtual(){
  const d=new Date();
  const m=String(d.getMonth()+1).padStart(2,'0');
  return `${m}/${d.getFullYear()}`;
}

function dataInputHoje(){
  const d=new Date();
  const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,10);
}

function dataInputOffset(dias){
  const d=new Date();
  d.setDate(d.getDate()+Number(dias||0));
  const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,10);
}

function moeda(v){
  return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}

function dataBR(v){
  const d=new Date(v);
  return isNaN(d)?'':d.toLocaleDateString('pt-BR');
}

function tituloTipo(t){
  return ({
    CATEGORIA_RECEITA:'Receitas',
    CATEGORIA_DESPESA:'Despesas',
    CATEGORIA_MERCADO:'Mercado',
    FORMA_PAGAMENTO:'Formas de pagamento',
    SISTEMA:'Sistema'
  })[t]||t.replaceAll('_',' ');
}

function assertOk(r){
  if(!r||!r.sucesso) throw new Error(r?.erro||'Erro na API');
}

function $(id){
  return document.getElementById(id);
}

function esc(v){
  return String(v??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c]));
}

function escAttr(v){
  return esc(v);
}

function toast(m){
  const t=$('toast');
  t.textContent=m;
  t.classList.remove('escondido');
  clearTimeout(t._timer);
  t._timer=setTimeout(()=>t.classList.add('escondido'),3000);
}

function rolarModuloTopo(){
  const tela=$('tela-modulo');
  if(tela && typeof tela.scrollTo==='function') tela.scrollTo({top:0,behavior:'auto'});
  window.scrollTo(0,0);
}

function formatarBytes(bytes){
  if(!bytes) return '0 KB';
  if(bytes<1024*1024) return `${Math.max(1,Math.round(bytes/1024))} KB`;
  return `${(bytes/1024/1024).toFixed(1)} MB`;
}

function arquivoParaPayload(file){
  const permitidos=['image/jpeg','image/png','application/pdf'];
  const max=10*1024*1024;

  if(!permitidos.includes(file.type)){
    throw new Error('Use um comprovante JPG, PNG ou PDF.');
  }

  if(file.size>max){
    throw new Error('O comprovante deve ter no máximo 10 MB.');
  }

  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const resultado=String(reader.result||'');
      const base64=resultado.includes('base64,')?resultado.split('base64,')[1]:resultado;
      resolve({
        nome:file.name,
        mimeType:file.type,
        base64
      });
    };
    reader.onerror=()=>reject(new Error('Não foi possível ler o comprovante.'));
    reader.readAsDataURL(file);
  });
}

async function chamarApi(dados){
  const r=await fetch(API_URL,{
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify(dados),
    cache:'no-store'
  });

  if(!r.ok) throw new Error('Erro de comunicação com o servidor.');

  const t=await r.text();
  try{
    return JSON.parse(t);
  }catch(e){
    throw new Error('Resposta inválida da API.');
  }
}
