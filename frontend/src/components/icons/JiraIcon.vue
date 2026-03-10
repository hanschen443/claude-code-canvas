<script setup lang="ts">
interface Props {
  size?: number | string
  class?: string
}

withDefaults(defineProps<Props>(), {
  size: 24,
  class: '',
})
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 496 512"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient
        id="jira-icon-grad-blue"
        x1="98.031%"
        x2="58.888%"
        y1=".161%"
        y2="40.766%"
        gradientUnits="userSpaceOnUse"
      >
        <stop
          offset="0%"
          stop-color="#0052CC"
        />
        <stop
          offset="92%"
          stop-color="#2684FF"
        />
      </linearGradient>
      <linearGradient
        id="jira-icon-grad-blue-r"
        x1="100.665%"
        x2="55.402%"
        y1=".455%"
        y2="44.727%"
        gradientUnits="userSpaceOnUse"
      >
        <stop
          offset="0%"
          stop-color="#0052CC"
        />
        <stop
          offset="92%"
          stop-color="#2684FF"
        />
      </linearGradient>
    </defs>
    <path
      fill="#2684FF"
      d="M244.658 0L121.04 123.328 0 244.658 121.04 365.988l123.618 123.327L367.997 365.988l61.81-61.81 61.808-61.81L368.288 121.04 244.658 0zm0 164.68l79.978 79.978-79.978 79.978-79.978-79.978 79.978-79.978z"
    />
    <path
      fill="url(#jira-icon-grad-blue)"
      d="M244.658 164.68C214.986 135.152 215.2 87.546 245.09 58.24L121.462 181.569l79.978 79.978 43.218-96.867z"
    />
    <path
      fill="url(#jira-icon-grad-blue-r)"
      d="M324.452 244.474l-79.794 79.794c29.672 29.528 29.458 77.134-.432 106.44l123.26-123.26-43.034-62.974z"
    />
  </svg>
</template>
