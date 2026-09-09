"use client";

import {
  CardPayment,
  initMercadoPago,
} from "@mercadopago/sdk-react";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";

type MercadoPagoDebitoProps = {
  valor: number;

  onSubmit: (
    formData: Record<string, unknown>
  ) => Promise<void>;

  onReady?: () => void;

  onError?: (
    error: unknown
  ) => void;
};

const publicKey =
  process.env
    .NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY;

if (publicKey) {
  initMercadoPago(
    publicKey,
    {
      locale: "pt-BR",
    }
  );
}

function MercadoPagoDebito({
  valor,
  onSubmit,
  onReady,
  onError,
}: MercadoPagoDebitoProps) {
  const onSubmitRef =
    useRef(onSubmit);

  const onReadyRef =
    useRef(onReady);

  const onErrorRef =
    useRef(onError);

  useEffect(() => {
    onSubmitRef.current =
      onSubmit;
  }, [onSubmit]);

  useEffect(() => {
    onReadyRef.current =
      onReady;
  }, [onReady]);

  useEffect(() => {
    onErrorRef.current =
      onError;
  }, [onError]);

  const initialization =
    useMemo(
      () => ({
        amount: Number(
          valor.toFixed(2)
        ),
      }),
      [valor]
    );

  /*
   * Débito:
   *
   * - exclui cartão de crédito
   * - exclui pré-pago
   * - deixa debit_card disponível
   */
  const customization =
    useMemo(
      () => ({
        paymentMethods: {
          types: {
            excluded: [
              "credit_card",
              "prepaid_card",
            ] as (
              | "credit_card"
              | "prepaid_card"
            )[],
          },
        },
      }),
      []
    );

  const handleSubmit =
    useCallback(
      async (
        formData: unknown
      ) => {
        await onSubmitRef.current(
          formData as Record<
            string,
            unknown
          >
        );
      },
      []
    );

  const handleReady =
    useCallback(() => {
      console.log(
        "Card Payment Brick de débito carregado."
      );

      onReadyRef.current?.();
    }, []);

  const handleError =
    useCallback(
      (
        error: unknown
      ) => {
        console.error(
          "Erro no Card Payment Brick de débito:",
          error
        );

        onErrorRef.current?.(
          error
        );
      },
      []
    );

  if (!publicKey) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-4">
        <p className="font-semibold text-red-800">
          Mercado Pago não configurado
        </p>

        <p className="mt-2 text-sm text-red-700">
          A chave pública do Mercado Pago
          não está disponível.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-300 bg-white p-4">
      <CardPayment
        initialization={
          initialization
        }
        customization={
          customization
        }
        onSubmit={
          handleSubmit
        }
        onReady={
          handleReady
        }
        onError={
          handleError
        }
      />
    </div>
  );
}

export default memo(
  MercadoPagoDebito
);
