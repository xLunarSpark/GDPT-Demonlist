<template>
    <!-- Botão para remover Taiago -->
    <button @click="removePlayer('Taiago')" class="remove-btn">
        Remove Taiago
    </button>

    <!-- Restante do template -->
    <ul v-if="list.length > 0">
        <li v-for="(level, index) in list" :key="index">
            {{ level.name }} - {{ level.verifier }} - {{ level.percentToQualify }}%
        </li>
    </ul>
    <p v-else>Nenhum nível disponível</p>
</template>

<script>
export default {
    data() {
        return {
            list: [], // Lista de níveis
        };
    },
    methods: {
        async fetchList() {
            // Chama a função do backend para buscar a lista de níveis
            const list = await fetch('/data/_list.json').then((res) => res.json());
            this.list = list;
        },

        async removePlayer(playerName) {
            // Filtra a lista removendo níveis que só "Taiago" completou
            this.list = this.list.filter(([level, err]) => {
                if (!level) return true; // Mantém os níveis com erro
                const filteredRecords = level.records.filter(record => record.user !== playerName);
                
                // Remover o nível se somente "Taiago" completou
                if (filteredRecords.length === 0) return false;
                
                // Atualiza os registros sem o jogador "Taiago"
                level.records = filteredRecords;
                return true;
            });

            // Atualiza a interface com as alterações
            this.selected = 0; // Resetar a seleção para o primeiro nível
        },
    },
    mounted() {
        // Carregar a lista ao montar o componente
        this.fetchList();
    },
};
</script>

<style scoped>
.remove-btn {
    background-color: red;
    color: white;
    padding: 10px;
    border: none;
    cursor: pointer;
    margin-top: 20px;
}
</style>
