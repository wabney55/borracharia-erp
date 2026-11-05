# RodoERP — gestão de borracharia

Aplicação web para gestão de borracharia com estrutura multifilial e execução em rede local. Esta entrega é uma primeira versão operacional: inclui a fundação de acesso e unidades, cadastros centrais, além de vendas básicas com caixa e baixa de estoque. Ela ainda não cobre todo o ERP descrito na especificação.

## O que está pronto nesta entrega

- Cadastro da empresa e das filiais, com ativação e preservação do histórico.
- Login local, senha armazenada com hash e troca obrigatória da senha inicial.
- Perfis iniciais e vínculos de usuário com uma ou mais unidades.
- Escopo de filial conferido no servidor para as operações existentes.
- Cadastro e consulta de clientes, produtos e serviços.
- Estoque por unidade, com entradas, saídas, contagem/ajuste, custo médio, alerta de mínimo e histórico auditável.
- Transferência de produtos entre unidades, com envio transacional, recebimento parcial e bloqueio de recebimento duplicado.
- Ordens de serviço por filial, com cliente identificado, veículo, produtos e serviços, conclusão transacional com baixa de estoque e conta a receber, e documento A4 para impressão.
- Vendas no balcão com divisão de pagamento, desconto autorizado e confirmação de preço e saldo no servidor.
- Abertura e fechamento de caixa por unidade. Vendas registram pagamentos, baixa de estoque, auditoria e contas a receber para vendas fiadas.
- Contas a pagar, recebimento de contas e despesas lançadas no caixa, com confirmação de unidade, permissão e caixa aberto.
- Relatório operacional por período e unidade, com faturamento, ordens concluídas, despesas, impressão do resumo e exportação CSV para abrir em planilhas.
- Painel inicial com indicadores das informações já registradas.
- PostgreSQL, Prisma Migrate, Docker Compose e rotina diária de backup.
- Interface responsiva em português, sem fontes ou serviços externos durante o uso.

Ainda faltam pagamentos parciais, sangria e suprimento de caixa, estornos de venda e OS, relatórios de estoque, inadimplência, margens e comparativos completos, arquivos PDF/XLSX e documentos A4 para venda, recibo e demonstrativo financeiro. O caixa registra abertura, fechamento, vendas, pagamentos, recebimentos e despesas. Vendas fiadas e ordens concluídas geram contas a receber. Esta entrega não substitui o ERP completo descrito na especificação.

## Início rápido no servidor

1. Instale Docker Desktop com suporte a Docker Compose e reserve um IP fixo para o computador servidor na rede local.
2. Copie `.env.example` para `.env` (`Copy-Item .env.example .env` no PowerShell).
3. Preencha `POSTGRES_PASSWORD` com uma senha alfanumérica longa, `SESSION_SECRET` com uma chave aleatória de pelo menos 32 caracteres e `INITIAL_ADMIN_PASSWORD` com a senha inicial escolhida (mínimo de 12 caracteres). Mantenha a senha do PostgreSQL sem `@`, `:`, `/` ou `?`, pois ela compõe a URL interna do banco.
4. Configure `BACKUP_DIR` para uma pasta em outro disco ou dispositivo de armazenamento. Por exemplo, no Windows: `BACKUP_DIR=D:/Borracharia/Backups`. Permita esse caminho nas configurações do Docker Desktop.
5. Abra um terminal nesta pasta e execute:

   ```powershell
   docker compose up -d --build
   ```

   Na primeira inicialização, o contêiner cria as tabelas, registra a empresa e a matriz iniciais e inicia o painel. A primeira cópia de segurança também é criada quando o banco fica disponível.

6. No computador servidor, consulte o endereço IPv4 com `ipconfig`. Em outro aparelho da mesma rede, abra `http://IP-DO-SERVIDOR:3000` (ou a porta definida em `APP_PORT`). Libere essa porta na rede local do Windows, sem encaminhá-la para a internet.

O acesso inicial usa o e-mail `admin@borracharia.local` e o valor definido em `INITIAL_ADMIN_PASSWORD`. Na primeira entrada, o sistema exige que você defina uma senha pessoal com pelo menos 12 caracteres.

## Instalação neste computador sem Docker

Este modo usa uma instalação local do Node.js e do PostgreSQL no Windows. Ele não configura o serviço automático de cópias de segurança que acompanha o Docker Compose.

1. Instale e inicie o PostgreSQL 16, 17 ou 18 e o Node.js 24.11 ou superior.
2. Abra a pasta do sistema e execute `instalar-local.cmd`.
3. Digite a senha do usuário `postgres` do PostgreSQL quando solicitado. A senha é usada somente nessa execução e não é salva pelo instalador.
4. Quando aparecer a mensagem de instalação concluída, abra `http://localhost:3000`. Mantenha a janela do instalador aberta enquanto usar o sistema; pressione `Ctrl+C` nessa janela para pará-lo.

O instalador cria o usuário e o banco `borracharia`, preserva um banco com esse nome caso já exista, aplica as migrações e registra os dados iniciais. Se você não souber a senha local do usuário `postgres`, será necessário redefini-la no PostgreSQL ou instalar o Docker Desktop antes de continuar.

## Operação e manutenção

```powershell
docker compose logs -f app       # acompanhar a aplicação
docker compose logs -f db        # acompanhar o PostgreSQL
docker compose ps                # estado dos serviços
docker compose restart app       # reiniciar a aplicação
docker compose down              # parar os serviços; mantém o volume do banco
```

Backup manual:

```powershell
docker compose exec backup sh /usr/local/bin/backup.sh now
```

Os arquivos `.dump` ficam na pasta apontada por `BACKUP_DIR`. Uma restauração precisa ser feita pelo responsável técnico com `pg_restore` em uma base vazia; pare a aplicação e confirme o arquivo e o destino antes de substituir dados. A rotina de restauração não foi exercitada nesta entrega.

Não remova o volume `postgres_data` ao parar o sistema. Ele guarda os dados principais. Mantenha cópias em outro dispositivo e teste a restauração periodicamente.

## Desenvolvimento

Requer Node.js 24.11 ou superior na linha 24, npm e PostgreSQL. Para gerar o Prisma Client e iniciar a interface:

```powershell
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

Antes, copie `.env.example` para `.env` e preencha `DATABASE_URL`, `SESSION_SECRET` e `INITIAL_ADMIN_PASSWORD`. Para mudanças de banco, crie uma migração versionada com `npm run db:migrate -- --name descricao-da-alteracao`; em produção, `docker compose up` aplica as migrações pendentes.

## Tecnologias

- Next.js 16.2 e React 19.2.
- Prisma ORM 7.10 com adaptador oficial para PostgreSQL.
- PostgreSQL 17.
- Docker Compose para aplicação, banco e backup.

O projeto segue a geração de cliente e o uso de adaptador exigidos pelo Prisma ORM 7. Consulte a [documentação do Prisma ORM 7](https://www.prisma.io/docs/orm/v7) e a [política de suporte do Next.js](https://nextjs.org/support-policy) para o estado de suporte das versões.
