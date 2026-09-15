export type Unidade = {
  id: string;
  codigo: string;
  nome: string;
  cidade: string | null;
  estado: string | null;
  ativo: boolean;
};

export type EstoqueUnidade = {
  quantidade: number;
  unidades: Unidade | null;
};

export type ProdutoCatalogo = {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  categoria: string | null;
  codigo: string;
  ativo: boolean;
  estoque_unidade: EstoqueUnidade[];
};

export type EstoqueDisponivel = {
  unidade: Unidade;
  quantidadeFisica: number;
  quantidadeDisponivel: number;
};

export type ProdutoComDisponibilidade = ProdutoCatalogo & {
  disponibilidades: EstoqueDisponivel[];
};
