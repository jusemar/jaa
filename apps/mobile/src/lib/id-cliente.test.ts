/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as z from "zod";
import { gerarIdCliente } from "./id-cliente.ts";

describe("idCliente", () => {
  it("é um UUID aceito pelo mesmo validador dos contratos e não se repete", () => {
    const ids = Array.from({ length: 200 }, gerarIdCliente);
    for (const id of ids) assert.equal(z.uuid().safeParse(id).success, true, id);
    assert.equal(new Set(ids).size, ids.length);
  });
});
