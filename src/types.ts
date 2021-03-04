export interface HashMap<T = any> {
  [key: string]: T;
}

export type Terminal = string[];

export type Terminals = HashMap<Terminal[]>;

export interface Options {
  commandTemplate: string;
  cwd: string;
  terminals: Terminals;
}
