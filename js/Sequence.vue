<template>
  <div class="view-sequence" :class="{ fullscreen: is_fullscreen }">
    <x5gon-header class="overlay"></x5gon-header>
    <div class="sequence-content">
      <h1>Sequence</h1>
      <svg-container class="svg-content" v-if="items.length > 0" :key="items.length" :viewbox="`0 0 ${Math.max(x_max,500)} 200`">

        <g transform="translate(0 100)">
          <g>
            <path v-for="(area, index) in distance_info"
                :key="`area${index}`"
                  stroke="none"
                  fill="#fff"
                  :fill-opacity="area.intensity"
                  :d="`M ${area.left.x} ${area.left.y} L ${area.left.x} ${-area.left.y} L ${area.right.x} ${-area.right.y} L ${area.right.x} ${area.right.y} Z`"></path>
          </g>
          <g>
            <resource-representation v-for="(item, index) in positioned_items"
                                     @resource_click="insert_item(item)"
                                     @resource_mouseover="on_resource_mouseover"
                                     :x="item.x_position"
                                     :y="0"
                                     fill="#000D32"
                                     :is_suggested="item.is_suggested"
                                     detailed_concepts
                                     :key="`${index}-${item.resource.url}`"
                                     :title="item.resource.title"
                                     :item="item.resource"></resource-representation>
          </g>
          <g :transform="`translate(0 ${radius_max+20})`">
            <path stroke="#fff"
                  stroke-width=".2"
                  marker-end="url(#triangle)"
                  :d="`M 0 0 l ${x_max} 0`"></path>
            <text :transform="`translate(${x_max} 5)`"
                  text-anchor="end"
                  fill="#505973"
                  font-family="Open Sans"
                  font-size="4">Total: {{ $constant.format_duration(total_duration) }}</text>
            <g v-for="(item, index) in positioned_items"
               :transform="`translate(${item.x_position} 0)`">
              <path stroke="#505973" stroke-width=".15" stroke-dasharray=".5 1"
                    :d="`M -${item.radius} 0 l 0 -${radius_max+20}`"></path>
              <path stroke="#505973" stroke-width=".15" stroke-dasharray=".5 1"
                    :d="`M ${item.radius} 0 l 0 -${radius_max+20}`"></path>
              <text transform="translate(0 -3)"
                    text-anchor="middle"
                    fill="#505973"
                    font-family="Open Sans"
                    font-size="4">{{ item.is_suggested ? `(+${item.duration_label})` : item.duration_label }}</text>
            </g>
          </g>
      </svg-container>
    </div>

    <resource-information-panel v-if="active_resource"
                                :resource="active_resource"
                                :concept_palette="concept_palette"
                                :is_fullscreen="is_fullscreen">
    </resource-information-panel>
    <div class="sequence-menu right-drawer-menu">
      <ul class="sequence-menu-list">
        <li @click="do_addition"><img alt="" src="img/icon_addition.svg">Automatic addition of resources</li>
        <li @click="do_export"><img alt="" src="img/icon_export.svg">Export</li>
        <li @click="do_export_tombz"><img alt="" src="img/icon_export.svg">Export to MBZ</li>
      </ul>
    </div>
    <x5gon-toolbar></x5gon-toolbar>
    <help-panel>
      <h2>Sequence view</h2>
      <p>This view presents an ordered sequence of resources,
        generated from a basket. The LAM system proposes an order for
        the elements. It also indicates the respective distances between
        resources: the more white the area between 2 resources is, the
        closer they are.</p>
      <p>Through the right menu, you can ask the LAM system to suggest
        additional resources to include into this sequence.</p>
    </help-panel>
  </div>
</template>

<script>
  module.exports = {
      name: "Sequence",
      data: function() {
          return {
              is_fullscreen: true,
              active_resource: null,
              palette: {},
          }
      },
      computed: {
          ...Vuex.mapState([ "sequence", "insertions", "sequence_distances", "mbzurl", "mbzinfos"]),
          items: function () {
              if (this.insertions.length == 0) {
                  return this.sequence.map(r => ({
                      resource: r,
                  }));
              };
              // Merge sequence and insertions
              let res = [];
              for (let i = 0 ; i < this.sequence.length ; i++) {
                  res.push({ resource: this.sequence[i],
                             is_suggested: false });
                  if (this.insertions[i] !== null && typeof this.insertions[i] == 'object') {
                      res.push({ resource: this.insertions[i],
                                 insert_after: i,
                                 is_suggested: true });
                  }
              }
              return res;
          },
          positioned_items: function () {
              // Return item list with x_position / y_position information added
              let x = 0;
              // This should be factorized somehow with the code in ResourceRepresentation
              let scale =  d3.scaleLinear()
                  .domain([ 60, this.$constant.max_duration ])
                  .range([ 10, this.$constant.max_width ]);
              return this.items.map(item => {
                  let width = scale(item.resource.duration);
                  x = x + scale(item.resource.duration);
                  item.x_position = x;
                  item.radius = width;
                  item.duration_label = this.$constant.format_duration(item.resource.duration);
                  x = x + scale(item.resource.duration) + 10;
                  return item;
              });
          },
          distance_info: function () {
              // Return a list of { left: {x, y}, right: {x, y}, distance } representing the distance zones to display
              return this.sequence_distances.map((distance, index) => ({
                  left: { x: this.positioned_items[index].x_position, y: this.positioned_items[index].radius },
                  right: { x: this.positioned_items[index+1].x_position, y: this.positioned_items[index+1].radius },
                  intensity: 1 - distance,
              }));
          },
          x_max: function () {
              return this.items.length > 0 ? this.positioned_items[this.items.length - 1].x_position + this.$constant.max_width : 500;
          },
          radius_max: function () {
              return Math.max(...this.items.map(i => i.radius));
          },
          total_duration: function () {
              return this.items
                  .filter(i => ! i.is_suggested)
                  .map(i => i.resource.duration)
                  .reduce( (a, b) => a + b, 0 );
          },

      },
      methods: {

          on_resource_mouseover: function (item) {
              this.active_resource = item;
          },
          concept_palette: function (url) {
              let color = this.palette[url];
              if (! color) {
                  color = this.$constant.palette.concepts.find(col => ! Object.values(this.palette).includes(col)) || '#000d32';
                  this.palette[url] = color;
              }
              return color;
          },
          show_basket: function () {
              this.$router.push('/basket');
          },
          show_help: function () {
          },
          do_organize: function () {
          },
          do_addition: function () {
              this.$store.dispatch('suggest_insertions');
          },
          do_export: function () {
              let resource_repr = (r) => `<li><a href="${r.url}">${r.title}</a></li>`;
              const data = `<html><head><title>X5Gon document sequence</title></head><body>
                            <ol>
                            ${this.sequence.map(resource_repr).join("\n")}
                            </ol>
                            </body></html>`;
              const a = document.createElement('a');
              document.body.appendChild(a);
              const url = URL.createObjectURL(new Blob([data], {type: "octet/stream"}));
              a.href = url;
              a.download = `${new Date().toISOString().substr(0, 19).replace(/[-:]/g, '').replace('T', '-')}-sequence.html`;
              a.click();
              setTimeout(() => {
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);
              }, 0);
          },
          do_export_tombz: function () {
              hola = this.$store.dispatch('export_tombz');
              hola.finally(response => {
                    mbz_url = this.mbzurl;
                    document.body.appendChild(mbz_url);
                    mbz_url.click();
              });

          },
          insert_item: function (item) {
              if (! item.is_suggested) {
                  return;
              }
              this.$store.dispatch('validate_insertion', item.insert_after);
          },
      },
      mounted: function () {

      }
    }
</script>

  <style scoped>
  h1 {
    font-family: IBM Plex Serif;
    font-weight: 500;
    font-size: 38px;
    line-height: 26px;
    color: #fff;
  }
  .fullscreen .sequence-content {
      height: calc(100vh - 170px);
  }
  .sequence-list {
      margin: 0 10%;
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
  }
  .view-itemdetail {
      width: 10vw;
      margin: 1vw;
  }
  .toolbar-icon {
      width: 32px;
      height: 32px;
  }
  .toolbar-icon + .toolbar-icon {
      margin-top: 12px;
  }
  .toolbar {
      position: absolute;
      top: 30px;
      right: 22px;
      display: flex;
      flex-direction: column;
  }
  .svg-content {
      margin-top: 50px;
      margin-left: 10px;
      width: calc(100% - 100px);
      max-height: 60vh;
  }
  .right-drawer-menu {
      position: fixed;
      top: 0;
      bottom: 0;
      right: 0;
      width: 78px;
      padding-top: 220px;
      background-color: #505973;
      color: #fff;
  }
  .right-drawer-menu:hover {
      width: 300px;
  }
  .sequence-menu-list {
      list-style: none;
      display: none;
  }
  .sequence-menu:hover .sequence-menu-list {
      display: block;
      margin-left: 4px;
      font-family: Open Sans;
      font-weight: 600;
      font-size: 14px;
      line-height: 18px;
      color: #000D32;
  }
  .sequence-menu-list li:hover {
      border: 1px solid #000D3299;
  }
</style>
