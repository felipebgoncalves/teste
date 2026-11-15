import { Component, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';

interface Estacao { codigo: string; nome: string; municipio: string; total24h: number; chuvaRecente: number | null; ultimaLeitura: string | null; medicoes: number; }
interface Chuva { inicioUtc: string; fimUtc: string; estacoes: Estacao[]; paginas: number; }

@Component({ selector: 'app-root', imports: [DecimalPipe, DatePipe], templateUrl: './app.html', styleUrl: './app.css' })
export class App implements OnInit {
  private http = inject(HttpClient);
  dados = signal<Chuva | null>(null);
  erro = signal('');
  carregando = signal(false);
  busca = signal('');
  ordenacao = signal<'nome' | 'recente' | 'acumulado'>('nome');
  ngOnInit() { this.atualizar(); }
  atualizar() {
    this.carregando.set(true); this.erro.set('');
    this.http.get<Chuva>('/api/chuva').subscribe({
      next: dados => { this.dados.set(dados); this.carregando.set(false); },
      error: e => { this.erro.set(e.error?.erro || 'Falha ao consultar os dados.'); this.carregando.set(false); }
    });
  }
  get estacoes() {
    const termo = this.busca().toLocaleLowerCase('pt-BR');
    return [...(this.dados()?.estacoes || [])].filter(e => `${e.nome} ${e.municipio} ${e.codigo}`.toLocaleLowerCase('pt-BR').includes(termo))
      .sort((a, b) => {
        const porNome = a.nome.localeCompare(b.nome, 'pt-BR');
        if (this.ordenacao() === 'recente') {
          if (a.chuvaRecente === null) return b.chuvaRecente === null ? porNome : 1;
          if (b.chuvaRecente === null) return -1;
          return b.chuvaRecente - a.chuvaRecente || porNome;
        }
        if (this.ordenacao() === 'acumulado') {
          if (!a.medicoes) return b.medicoes ? 1 : porNome;
          if (!b.medicoes) return -1;
          return b.total24h - a.total24h || porNome;
        }
        return porNome;
      });
  }
  get comDados() { return this.dados()?.estacoes.filter(e => e.medicoes > 0).length || 0; }
  get maiorAcumulado() { return Math.max(0, ...(this.dados()?.estacoes.map(e => e.total24h) || [])); }
}
