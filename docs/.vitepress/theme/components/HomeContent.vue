<script setup lang="ts">
import { useRoute } from 'vitepress'
import HomeLayout from './HomeLayout.vue'

const route = useRoute()
const isHome = route.path === '/' || route.path === '/index.html'
</script>

<template>
  <HomeLayout v-if="isHome" />
</template>
