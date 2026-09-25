// Leitura de hotéis do lado do servidor: rota não importa @hubkeep/db (lint).
import { type Contexto, type HotelVisivel, listarHoteisVisiveis } from '@hubkeep/db';
import { acessoBanco } from './composicao';

export async function hoteisVisiveis(ctx: Contexto): Promise<HotelVisivel[]> {
  return (await acessoBanco()).withContext(ctx, listarHoteisVisiveis);
}
