type Props = {
  params: Promise<{
    numero: string;
  }>;
};

export default async function PedidoPage({ params }: Props) {
  const { numero } = await params;

  return (
    <main className="p-10">
      <h1 className="text-3xl font-bold">
        Teste do Pedido nº {numero}
      </h1>
    </main>
  );
}