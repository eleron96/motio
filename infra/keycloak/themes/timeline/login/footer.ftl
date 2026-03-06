<#macro content>
  <#assign timelineHomeUrl = "/" />
  <#if client?? && client.baseUrl?has_content>
    <#assign timelineHomeUrl = client.baseUrl />
  </#if>

  <div class="timeline-login-footer-actions">
    <a id="timeline-back-home" class="pf-c-button btn-default pf-m-block btn-lg" href="${timelineHomeUrl}">
      ${msg("timelineBackToHome")}
    </a>
  </div>
</#macro>
