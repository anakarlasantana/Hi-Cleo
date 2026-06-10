export function TermsContent() {
  return (
    <>
      <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
        Termos de Uso e Política de Privacidade
      </h1>
      <p className="text-sm text-muted-foreground mb-10">Última atualização: Janeiro de 2025</p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-6">Termos de Uso</h2>
        <div className="space-y-6 text-muted-foreground leading-relaxed">
          <div>
            <h3 className="text-lg font-medium text-foreground mb-2">1. Sobre o Serviço</h3>
            <p>A Cleo é uma secretária virtual que opera via WhatsApp, oferecida pela Hi Cleo. O serviço organiza contatos, envia lembretes automáticos e realiza acompanhamento personalizado de clientes para profissionais autônomos e pequenas empresas.</p>
          </div>
          <div>
            <h3 className="text-lg font-medium text-foreground mb-2">2. Aceitação dos Termos</h3>
            <p>Ao ativar e utilizar a Cleo, você concorda com estes Termos de Uso e com a Política de Privacidade descrita abaixo. O uso continuado do serviço constitui aceitação de eventuais atualizações destes termos.</p>
          </div>
          <div>
            <h3 className="text-lg font-medium text-foreground mb-2">3. Planos e Pagamento</h3>
            <p>O serviço é oferecido em planos de assinatura (Solo, Equipe e Empresa), cada um com limites específicos de usuários. O pagamento pode ser mensal ou anual, com economia de 2 meses no plano anual.</p>
          </div>
          <div>
            <h3 className="text-lg font-medium text-foreground mb-2">4. Cancelamento</h3>
            <p>Você pode cancelar sua assinatura a qualquer momento, sem multa ou taxa adicional. Após o cancelamento, o acesso permanece ativo até o final do período já pago. Nos primeiros 7 dias após a primeira assinatura, é garantido reembolso integral conforme o Código de Defesa do Consumidor (Art. 49). A reativação com preservação de dados é possível por até 30 dias após o encerramento.</p>
          </div>
          <div>
            <h3 className="text-lg font-medium text-foreground mb-2">5. Uso Adequado</h3>
            <p>Você se compromete a utilizar a Cleo de forma lícita, respeitando a legislação brasileira e os direitos de terceiros. É proibido utilizar o serviço para envio de spam, mensagens não solicitadas em massa ou qualquer atividade que viole os termos de uso do WhatsApp.</p>
          </div>
          <div>
            <h3 className="text-lg font-medium text-foreground mb-2">6. Disponibilidade</h3>
            <p>Nos esforçamos para manter o serviço disponível 24 horas por dia, mas não garantimos disponibilidade ininterrupta. Manutenções programadas serão comunicadas com antecedência sempre que possível.</p>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-6">Política de Privacidade</h2>
        <p className="text-muted-foreground mb-6 leading-relaxed">Esta política descreve como coletamos, usamos e protegemos seus dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).</p>
        <div className="space-y-6 text-muted-foreground leading-relaxed">
          <div>
            <h3 className="text-lg font-medium text-foreground mb-2">1. Dados Coletados</h3>
            <p>Coletamos os seguintes dados para prestação do serviço:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Nome e dados de identificação profissional</li>
              <li>Número de telefone (WhatsApp)</li>
              <li>Endereço de e-mail</li>
              <li>Dados dos contatos/clientes que você cadastra na Cleo</li>
              <li>Mensagens trocadas com a Cleo para funcionamento do serviço</li>
              <li>Dados de pagamento (processados por terceiros)</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-medium text-foreground mb-2">2. Finalidade do Tratamento</h3>
            <p>Seus dados são utilizados para:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Prestação do serviço de secretária virtual</li>
              <li>Organização e acompanhamento dos seus contatos</li>
              <li>Envio de lembretes e notificações configuradas por você</li>
              <li>Comunicações sobre o serviço e suporte</li>
              <li>Melhoria contínua do produto</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-medium text-foreground mb-2">3. Base Legal</h3>
            <p>O tratamento de dados é realizado com base no seu consentimento explícito (Art. 7º, I da LGPD) e na execução do contrato de prestação de serviço (Art. 7º, V da LGPD).</p>
          </div>
          <div>
            <h3 className="text-lg font-medium text-foreground mb-2">4. Armazenamento e Segurança</h3>
            <p>Seus dados são armazenados em servidores seguros com criptografia em trânsito e em repouso. Mantemos os dados enquanto sua conta estiver ativa e por até 30 dias após o cancelamento para possibilitar reativação. Após esse período, os dados são removidos permanentemente.</p>
          </div>
          <div>
            <h3 className="text-lg font-medium text-foreground mb-2">5. Compartilhamento de Dados</h3>
            <p>Não vendemos seus dados. O compartilhamento ocorre apenas com:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Processadores de pagamento (para cobrança da assinatura)</li>
              <li>Infraestrutura de hospedagem (para funcionamento do serviço)</li>
              <li>Autoridades competentes (quando exigido por lei)</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-medium text-foreground mb-2">6. Seus Direitos (LGPD)</h3>
            <p>Você tem direito a:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Confirmar a existência de tratamento dos seus dados</li>
              <li>Acessar seus dados pessoais</li>
              <li>Corrigir dados incompletos ou desatualizados</li>
              <li>Solicitar a eliminação dos dados</li>
              <li>Revogar o consentimento a qualquer momento</li>
              <li>Solicitar portabilidade dos dados</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-medium text-foreground mb-2">7. Cookies e Tecnologias</h3>
            <p>Utilizamos cookies essenciais para funcionamento do site e cookies analíticos para entender como o serviço é utilizado. Você pode gerenciar suas preferências de cookies nas configurações do navegador.</p>
          </div>
          <div>
            <h3 className="text-lg font-medium text-foreground mb-2">8. Contato</h3>
            <p>Para exercer seus direitos ou esclarecer dúvidas sobre o tratamento de dados, entre em contato:</p>
            <div className="mt-3 bg-muted rounded-lg p-4">
              <p className="text-foreground font-medium">Hi Cleo - Encarregado de Dados (DPO)</p>
              <p className="mt-1">E-mail: hicleo.app@gmail.com</p>
              <p>WhatsApp: (48) 99999-9999</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Alterações nestes Termos</h2>
        <p className="text-muted-foreground leading-relaxed">Podemos atualizar estes termos periodicamente. Quando isso ocorrer, você será notificado e um novo aceite será solicitado. A versão mais recente estará sempre disponível nesta página.</p>
      </section>
    </>
  )
}
