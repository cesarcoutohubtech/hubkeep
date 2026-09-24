// IDs são UUID v7 gerados pela aplicação (CLAUDE.md, "Banco de dados"): o banco
// não gera identidade de negócio, e o v7 ordena por tempo, o que mantém os
// índices de PK compactos.
import { v7 } from 'uuid';

export const novoId = (): string => v7();
